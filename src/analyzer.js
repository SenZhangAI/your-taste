import Anthropic from '@anthropic-ai/sdk';
import { readFile } from 'fs/promises';
import { DIMENSIONS } from './dimensions.js';

export async function analyzeTranscript(conversationText, pendingRuleTexts = []) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { signals: [], rules: [] };
  }

  const promptTemplate = await readFile(
    new URL('../prompts/extract-preferences.md', import.meta.url),
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

  const client = new Anthropic();

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  return parseAnalysisResponse(response.content[0].text);
}

export function parseAnalysisResponse(text) {
  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const result = JSON.parse(cleaned);

    if (result.session_quality === 'none') return { signals: [], rules: [] };

    const signals = (result.signals || []).filter(
      s => DIMENSIONS[s.dimension] && typeof s.score === 'number',
    );

    const rules = (result.candidate_rules || []).filter(
      r => typeof r === 'string' && r.trim().length > 0,
    );

    return { signals, rules };
  } catch {
    return { signals: [], rules: [] };
  }
}
