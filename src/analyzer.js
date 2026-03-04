import { readFile } from 'fs/promises';
import { complete } from './llm.js';
import { debug } from './debug.js';
import { readLang, languageName, getTemplates } from './lang.js';

// --- Shared helpers ---

const VALID_STRENGTHS = new Set(['correction', 'rejection', 'active_request', 'pushback']);
const VALID_CATEGORIES = new Set(['verification_skip', 'breadth_miss', 'depth_skip', 'assumption_leak', 'overreach']);

function buildLanguageInstruction(lang) {
  if (lang === 'en') return '';
  const name = languageName(lang);
  return `## Output Language\n\nWrite candidate_rules text and evidence in ${name}.`;
}

// Markers that separate instructions (system) from data (user) in prompts.
// Everything before the first matching marker → system prompt, everything after → user message.
const DATA_SEPARATORS = [
  '## Conversation Transcript',  // extract-signals prompt
  '## Reasoning Gaps',           // synthesize-profile prompt
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

// --- Pass 1: Extract reasoning gaps from a single session ---

export async function extractSignals(conversationText) {
  const promptTemplate = await readFile(
    new URL('../prompts/extract-signals.md', import.meta.url),
    'utf8',
  );

  const response = await callLLM(promptTemplate, {
    TRANSCRIPT: conversationText,
  });

  const parsed = parseExtractResponse(response);
  debug(`extract: ${parsed.reasoningGaps.length} reasoning gaps, context=${parsed.context ? 'yes' : 'null'}`);
  return parsed;
}

// --- Pass 2: Synthesize profile from accumulated signals ---

export async function synthesizeProfile(reasoningGaps, existingObservations = null, confirmedRuleTexts = [], model = null) {
  const promptTemplate = await readFile(
    new URL('../prompts/synthesize-profile.md', import.meta.url),
    'utf8',
  );

  const signalsText = reasoningGaps.map((gap, i) => {
    // New format: reasoning gap fields
    if (gap.what_ai_did && gap.what_broke) {
      let line = `${i + 1}. [${gap.category || 'verification_skip'}] AI did: ${gap.what_ai_did} → Broke: ${gap.what_broke}`;
      if (gap.missing_step) line += ` → Missing step: ${gap.missing_step}`;
      line += ` → Checkpoint: ${gap.checkpoint}`;
      return line;
    }
    // Legacy fallback: decision point fields
    let line = `${i + 1}. [${gap.strength || 'correction'}] AI proposed: ${gap.ai_proposed} → User: ${gap.user_reacted} → Principle: ${gap.principle}`;
    if (gap.conditions) line += ` → Conditions: ${gap.conditions}`;
    return line;
  }).join('\n');

  const lang = await readLang();
  const t = getTemplates(lang);

  const existingSection = existingObservations
    ? `## Existing Framework\n\nMerge new evidence into this existing framework. Re-evaluate all checkpoints against the combined evidence.\n\n${existingObservations}`
    : '';

  const tasteSection = confirmedRuleTexts.length > 0
    ? `## Existing Confirmed Rules\n\nDo NOT duplicate these in the framework:\n${confirmedRuleTexts.map(r => `- "${r}"`).join('\n')}`
    : '';

  const response = await callLLM(promptTemplate, {
    REASONING_CHECKPOINTS_HEADER: t.reasoningCheckpointsHeader || 'Reasoning Checkpoints',
    DOMAIN_REASONING_HEADER: t.domainReasoningHeader || 'Domain Reasoning',
    FAILURE_PATTERNS_HEADER: t.failurePatternsHeader || 'Failure Patterns',
    EXISTING_OBSERVATIONS: existingSection,
    TASTE_RULES: tasteSection,
    LANGUAGE: buildLanguageInstruction(lang),
    SIGNALS: signalsText,
  }, { timeoutMs: 360_000, model });

  const result = parseSynthesisResponse(response);
  debug(`synthesize: produced ${result.length} chars of observations markdown`);
  return result;
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

export function parseExtractResponse(text) {
  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const result = JSON.parse(cleaned);

    // New format: reasoning_gaps
    if (Array.isArray(result.reasoning_gaps)) {
      const reasoningGaps = result.reasoning_gaps
        .filter(gap =>
          gap && typeof gap === 'object' &&
          typeof gap.what_ai_did === 'string' &&
          typeof gap.what_broke === 'string' &&
          typeof gap.checkpoint === 'string' &&
          gap.checkpoint.trim().length > 0
        )
        .map(gap => ({
          what_ai_did: gap.what_ai_did.trim(),
          what_broke: gap.what_broke.trim(),
          missing_step: typeof gap.missing_step === 'string' ? gap.missing_step.trim() : '',
          checkpoint: gap.checkpoint.trim(),
          strength: VALID_STRENGTHS.has(gap.strength) ? gap.strength : 'correction',
          category: VALID_CATEGORIES.has(gap.category) ? gap.category : 'verification_skip',
        }));

      const context = validateContext(result.session_context);
      const userLanguage = typeof result.user_language === 'string' ? result.user_language.trim().toLowerCase() : null;
      return { reasoningGaps, context, userLanguage };
    }

    // Legacy backward compat: decision_points → reasoningGaps
    if (Array.isArray(result.decision_points)) {
      const reasoningGaps = result.decision_points
        .filter(dp =>
          dp && typeof dp === 'object' &&
          typeof dp.ai_proposed === 'string' &&
          typeof dp.principle === 'string' &&
          dp.principle.trim().length > 0
        )
        .map(dp => ({
          what_ai_did: dp.ai_proposed.trim(),
          what_broke: typeof dp.user_reacted === 'string' ? dp.user_reacted.trim() : '',
          missing_step: '',
          checkpoint: dp.principle.trim(),
          strength: VALID_STRENGTHS.has(dp.strength) ? dp.strength : 'correction',
          category: 'verification_skip',
        }));

      const context = validateContext(result.session_context);
      const userLanguage = typeof result.user_language === 'string' ? result.user_language.trim().toLowerCase() : null;
      return { reasoningGaps, context, userLanguage };
    }

    return { reasoningGaps: [], context: null, userLanguage: null };
  } catch {
    return { reasoningGaps: [], context: null, userLanguage: null };
  }
}

export function parseSynthesisResponse(text) {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:markdown)?\n?/, '').replace(/\n?```$/, '').trim();
  return cleaned;
}
