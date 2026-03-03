import { readFile } from 'fs/promises';
import { complete } from './llm.js';
import { DIMENSIONS, DIMENSION_NAMES } from './dimensions.js';
import { debug } from './debug.js';
import { readLang, languageName, getTemplates } from './lang.js';

// --- Shared helpers ---

function buildDimensionDesc() {
  return Object.entries(DIMENSIONS)
    .map(([key, d]) => `- **${key}** (0.0 = ${d.low}, 1.0 = ${d.high})`)
    .join('\n');
}

function buildLanguageInstruction(lang) {
  if (lang === 'en') return '';
  const name = languageName(lang);
  return `## Output Language\n\nWrite candidate_rules text and evidence in ${name}. Dimension fields (dimension, direction) stay in English.`;
}

function buildPendingSection(pendingRuleTexts) {
  if (!pendingRuleTexts?.length) return '';
  const list = pendingRuleTexts.map(r => `- "${r}"`).join('\n');
  return `If a candidate rule is semantically equivalent to an existing pending rule below, use the EXACT text of the existing rule instead of generating new wording.\n\nExisting pending rules:\n${list}`;
}

// Markers that separate instructions (system) from data (user) in prompts.
// Everything before the first matching marker → system prompt, everything after → user message.
const DATA_SEPARATORS = [
  '## Conversation Transcript',  // extract-signals prompt
  '## Decision Points',          // synthesize-profile prompt
];

async function callLLM(promptTemplate, replacements, { timeoutMs, model } = {}) {
  let prompt = promptTemplate;
  for (const [key, value] of Object.entries(replacements)) {
    prompt = prompt.replace(`{{${key}}}`, value);
  }

  // Split instructions (system) from data (user) at the first matching separator.
  // This prevents LLMs from treating analysis instructions as injection,
  // and is more efficient for long prompts (system prompt is cached by providers).
  let systemPrompt = null;
  let userContent = prompt;
  for (const sep of DATA_SEPARATORS) {
    const sepIndex = prompt.indexOf(sep);
    if (sepIndex !== -1) {
      systemPrompt = prompt.slice(0, sepIndex).trim();
      userContent = prompt.slice(sepIndex).trim();
      break;
    }
  }

  debug(`analyzer: sending prompt (${prompt.length} chars) to LLM`);
  const response = await complete(userContent, { systemPrompt, timeoutMs, model });
  debug(`analyzer: raw response (${response.length} chars): ${response.slice(0, 500)}${response.length > 500 ? '...' : ''}`);
  return response;
}

// --- Pass 1: Extract decision points from a single session ---

export async function extractSignals(conversationText) {
  const promptTemplate = await readFile(
    new URL('../prompts/extract-signals.md', import.meta.url),
    'utf8',
  );

  const response = await callLLM(promptTemplate, {
    DIMENSION_NAMES: DIMENSION_NAMES.join(', '),
    TRANSCRIPT: conversationText,
  });

  const parsed = parseExtractResponse(response);
  debug(`extract: ${parsed.decisionPoints.length} decision points, context=${parsed.context ? 'yes' : 'null'}`);
  return parsed;
}

// --- Pass 2: Synthesize profile from accumulated signals ---

export async function synthesizeProfile(decisionPoints, existingObservations = null, tasteRuleTexts = [], model = null) {
  const promptTemplate = await readFile(
    new URL('../prompts/synthesize-profile.md', import.meta.url),
    'utf8',
  );

  const signalsText = decisionPoints.map((dp, i) => {
    let line = `${i + 1}. [${dp.strength}] ${dp.dimension}: AI proposed: ${dp.ai_proposed} → User: ${dp.user_reacted} → Principle: ${dp.principle}`;
    if (dp.conditions) line += ` → Conditions: ${dp.conditions}`;
    return line;
  }).join('\n');

  const lang = await readLang();
  const t = getTemplates(lang);

  const existingSection = existingObservations
    ? `## Existing Observations\n\nMerge new evidence into these existing observations. Re-evaluate all patterns against the combined evidence.\n\n${existingObservations}`
    : '';

  const tasteSection = tasteRuleTexts.length > 0
    ? `## Existing taste.md Rules\n\nDo NOT duplicate these in Suggested Rules:\n${tasteRuleTexts.map(r => `- "${r}"`).join('\n')}`
    : '';

  // Synthesis is heavier than extraction — needs to produce full Markdown from many decision points.
  // 360s timeout accounts for the 4th section (Common Misreads) adding ~20% output.
  const response = await callLLM(promptTemplate, {
    THINKING_PATTERNS_HEADER: t.thinkingPatternsHeader || 'Thinking Patterns',
    WORKING_PRINCIPLES_HEADER: t.workingPrinciplesHeader || 'Working Principles',
    SUGGESTED_RULES_HEADER: t.suggestedRulesHeader || 'Suggested Rules',
    COMMON_MISREADS_HEADER: t.commonMisreadsHeader || 'Common Misreads',
    EXISTING_OBSERVATIONS: existingSection,
    TASTE_RULES: tasteSection,
    LANGUAGE: buildLanguageInstruction(lang),
    SIGNALS: signalsText,
  }, { timeoutMs: 360_000, model });

  const result = parseSynthesisResponse(response);
  debug(`synthesize: produced ${result.length} chars of observations markdown`);
  return result;
}

// --- Legacy single-pass analysis (used by session-end.js hook) ---

export async function analyzeTranscript(conversationText, pendingRuleTexts = []) {
  const promptTemplate = await readFile(
    new URL('../prompts/analyze-session.md', import.meta.url),
    'utf8',
  );

  const lang = await readLang();
  const response = await callLLM(promptTemplate, {
    DIMENSIONS: buildDimensionDesc(),
    PENDING_RULES: buildPendingSection(pendingRuleTexts),
    LANGUAGE: buildLanguageInstruction(lang),
    TRANSCRIPT: conversationText,
  });

  const parsed = parseAnalysisResponse(response);
  debug(`analyzer: parsed ${parsed.signals.length} signals, ${parsed.rules.length} rules, context=${parsed.context ? 'yes' : 'null'}`);
  return parsed;
}

function validateContext(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const filterStrings = arr =>
    (Array.isArray(arr) ? arr : []).filter(s => typeof s === 'string' && s.trim().length > 0);

  const topics = filterStrings(raw.topics);
  const decisions = filterStrings(raw.decisions);
  const open_questions = filterStrings(raw.open_questions);

  if (topics.length === 0 && decisions.length === 0 && open_questions.length === 0) return null;

  return { topics, decisions, open_questions };
}

// --- Parse functions ---

const VALID_STRENGTHS = new Set(['correction', 'rejection', 'active_request', 'pushback']);

export function parseExtractResponse(text) {
  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const result = JSON.parse(cleaned);

    const decisionPoints = (result.decision_points || [])
      .filter(dp =>
        dp && typeof dp === 'object' &&
        typeof dp.ai_proposed === 'string' &&
        typeof dp.user_reacted === 'string' &&
        typeof dp.principle === 'string' &&
        dp.principle.trim().length > 0
      )
      .map(dp => ({
        ai_proposed: dp.ai_proposed.trim(),
        user_reacted: dp.user_reacted.trim(),
        strength: VALID_STRENGTHS.has(dp.strength) ? dp.strength : 'correction',
        dimension: DIMENSION_NAMES.includes(dp.dimension) ? dp.dimension : null,
        principle: dp.principle.trim(),
        conditions: typeof dp.conditions === 'string' && dp.conditions.trim().length > 0
          ? dp.conditions.trim() : null,
      }));

    const context = validateContext(result.session_context);
    const userLanguage = typeof result.user_language === 'string' ? result.user_language.trim().toLowerCase() : null;
    return { decisionPoints, context, userLanguage };
  } catch {
    return { decisionPoints: [], context: null, userLanguage: null };
  }
}

export function parseSynthesisResponse(text) {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:markdown)?\n?/, '').replace(/\n?```$/, '').trim();
  return cleaned;
}

export function parseAnalysisResponse(text) {
  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const result = JSON.parse(cleaned);

    const signals = (result.signals || []).filter(
      s => DIMENSIONS[s.dimension] && typeof s.score === 'number',
    );

    const rules = (result.candidate_rules || [])
      .map(r => {
        // Object format: { text, evidence }
        if (r && typeof r === 'object' && typeof r.text === 'string' && r.text.trim().length > 0) {
          return { text: r.text.trim(), evidence: typeof r.evidence === 'string' ? r.evidence.trim() : null };
        }
        // Legacy string format
        if (typeof r === 'string' && r.trim().length > 0) return { text: r.trim(), evidence: null };
        return null;
      })
      .filter(Boolean);

    const context = validateContext(result.session_context);

    return { signals, rules, context };
  } catch {
    return { signals: [], rules: [], context: null };
  }
}
