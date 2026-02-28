import { readFile } from 'fs/promises';
import { complete } from './llm.js';
import { DIMENSIONS } from './dimensions.js';

export async function analyzeTranscript(conversationText, pendingRuleTexts = []) {
  const promptTemplate = await readFile(
    new URL('../prompts/analyze-session.md', import.meta.url),
    'utf8',
  );

  const dimensionDesc = Object.entries(DIMENSIONS)
    .map(([key, d]) => `- **${key}** (0.0 = ${d.low}, 1.0 = ${d.high})`)
    .join('\n');

  let pendingSection = '';
  if (pendingRuleTexts.length > 0) {
    const list = pendingRuleTexts.map(r => `- "${r}"`).join('\n');
    pendingSection = `If a candidate rule is semantically equivalent to an existing pending rule below, use the EXACT text of the existing rule instead of generating new wording.\n\nExisting pending rules:\n${list}`;
  }

  const prompt = promptTemplate
    .replace('{{DIMENSIONS}}', dimensionDesc)
    .replace('{{PENDING_RULES}}', pendingSection)
    .replace('{{TRANSCRIPT}}', conversationText);

  const response = await complete(prompt);
  return parseAnalysisResponse(response);
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

export function parseAnalysisResponse(text) {
  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const result = JSON.parse(cleaned);

    const signals = (result.signals || []).filter(
      s => DIMENSIONS[s.dimension] && typeof s.score === 'number',
    );

    const rules = (result.candidate_rules || []).filter(
      r => typeof r === 'string' && r.trim().length > 0,
    );

    const context = validateContext(result.session_context);

    return { signals, rules, context };
  } catch {
    return { signals: [], rules: [], context: null };
  }
}
