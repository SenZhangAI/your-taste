import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import { complete } from './llm.js';
import { readObservations } from './observations.js';
import { debug } from './debug.js';
import { readLang, languageName } from './lang.js';

function getThinkingContextPath() {
  const dir = process.env.YOUR_TASTE_DIR || `${process.env.HOME}/.your-taste`;
  return `${dir}/thinking-context.md`;
}

function buildLanguageInstruction(lang) {
  if (lang === 'en') return '';
  const name = languageName(lang);
  return `## Output Language\n\nWrite all text fields in ${name}.`;
}

export async function synthesizeThinkingContext() {
  const promptTemplate = await readFile(
    new URL('../prompts/synthesize-thinking.md', import.meta.url),
    'utf8',
  );

  const baseFramework = await readFile(
    new URL('../prompts/base-thinking.md', import.meta.url),
    'utf8',
  );

  const observations = await readObservations();
  if (!observations) {
    debug('synthesize-thinking: no observations, skipping');
    return null;
  }

  const lang = await readLang();

  let prompt = promptTemplate;
  prompt = prompt.replace('{{BASE_FRAMEWORK}}', baseFramework);
  prompt = prompt.replace('{{OBSERVATIONS}}', observations);
  prompt = prompt.replace('{{EXISTING_RULES}}', '');
  prompt = prompt.replace('{{LANGUAGE}}', buildLanguageInstruction(lang));

  debug(`synthesize-thinking: sending prompt (${prompt.length} chars)`);
  const result = await complete(prompt, { timeoutMs: 120_000 });
  debug(`synthesize-thinking: received ${result.length} chars`);

  // Clean markdown fencing if present
  let cleaned = result.trim();
  cleaned = cleaned.replace(/^```(?:markdown)?\n?/, '').replace(/\n?```$/, '').trim();

  // Write to thinking-context.md
  const path = getThinkingContextPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, cleaned, 'utf8');

  debug(`synthesize-thinking: wrote ${cleaned.length} chars to ${path}`);
  return cleaned;
}
