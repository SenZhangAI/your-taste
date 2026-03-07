import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import { complete } from './llm.js';
import { readObservations } from './observations.js';
import { debug } from './debug.js';
import { readLang, languageName } from './lang.js';

function getTasteDir() {
  return process.env.YOUR_TASTE_DIR || `${process.env.HOME}/.your-taste`;
}

function getThinkingContextPath() {
  return `${getTasteDir()}/thinking-context.md`;
}

function getSkipDecisionsPath() {
  return `${getTasteDir()}/observations-skip-decisions.md`;
}

async function readSkipDecisions() {
  try {
    const content = await readFile(getSkipDecisionsPath(), 'utf8');
    return content.trim() || null;
  } catch {
    return null;
  }
}

function extractSkipDecisions(text) {
  const match = text.match(/<!-- skip-decisions\n([\s\S]*?)-->/);
  return match ? match[1].trim() : null;
}

function removeSkipDecisions(text) {
  return text.replace(/\n*<!-- skip-decisions\n[\s\S]*?-->/, '').trim();
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

  const existingSkips = await readSkipDecisions();
  const skipSection = existingSkips
    ? `## Previous Skip Decisions\n\nThese patterns were previously evaluated and skipped. Re-evaluate if new evidence changes the assessment, otherwise preserve the decision.\n\n${existingSkips}`
    : '';

  let prompt = promptTemplate;
  prompt = prompt.replace('{{BASE_FRAMEWORK}}', baseFramework);
  prompt = prompt.replace('{{OBSERVATIONS}}', observations);
  prompt = prompt.replace('{{EXISTING_RULES}}', '');
  prompt = prompt.replace('{{SKIP_DECISIONS}}', skipSection);
  prompt = prompt.replace('{{LANGUAGE}}', buildLanguageInstruction(lang));

  debug(`synthesize-thinking: sending prompt (${prompt.length} chars)`);
  const result = await complete(prompt, { timeoutMs: 120_000 });
  debug(`synthesize-thinking: received ${result.length} chars`);

  // Clean markdown fencing if present
  let cleaned = result.trim();
  cleaned = cleaned.replace(/^```(?:markdown)?\n?/, '').replace(/\n?```$/, '').trim();

  // Extract and save skip decisions before removing from output
  const skipDecisions = extractSkipDecisions(cleaned);
  const thinkingContent = removeSkipDecisions(cleaned);

  const dir = getTasteDir();
  await mkdir(dir, { recursive: true });

  // Write thinking-context.md (without skip decisions)
  const path = getThinkingContextPath();
  await writeFile(path, thinkingContent, 'utf8');
  debug(`synthesize-thinking: wrote ${thinkingContent.length} chars to ${path}`);

  // Write skip decisions
  if (skipDecisions) {
    await writeFile(getSkipDecisionsPath(), skipDecisions + '\n', 'utf8');
    debug(`synthesize-thinking: wrote skip decisions to ${getSkipDecisionsPath()}`);
  }

  return thinkingContent;
}
