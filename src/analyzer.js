import Anthropic from '@anthropic-ai/sdk';
import { readFile } from 'fs/promises';
import { DIMENSIONS } from './dimensions.js';

export async function analyzeTranscript(conversationText) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return [];
  }

  const promptTemplate = await readFile(
    new URL('../prompts/extract-preferences.md', import.meta.url),
    'utf8',
  );

  const dimensionDesc = Object.entries(DIMENSIONS)
    .map(([key, d]) => `- **${key}** (0.0 = ${d.low}, 1.0 = ${d.high})`)
    .join('\n');

  const prompt = promptTemplate
    .replace('{{DIMENSIONS}}', dimensionDesc)
    .replace('{{TRANSCRIPT}}', conversationText);

  const client = new Anthropic();

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  return parseResponse(response.content[0].text);
}

function parseResponse(text) {
  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const result = JSON.parse(cleaned);

    if (result.session_quality === 'none') return [];

    return (result.signals || []).filter(
      s => DIMENSIONS[s.dimension] && typeof s.score === 'number',
    );
  } catch {
    return [];
  }
}
