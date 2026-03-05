import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';

function getDir() {
  return process.env.YOUR_TASTE_DIR || `${process.env.HOME}/.your-taste`;
}

function getPath() {
  return `${getDir()}/observations.md`;
}

export async function readObservations() {
  try {
    const content = await readFile(getPath(), 'utf8');
    return content.trim() || null;
  } catch {
    return null;
  }
}

export async function writeObservations(content) {
  const path = getPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf8');
}

/**
 * Extract content under a ## heading, up to the next ## heading or EOF.
 * Works with any language headers (English or localized).
 */
export function extractSection(markdown, heading) {
  const lines = markdown.split('\n');
  let capturing = false;
  const sectionLines = [];
  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (capturing) break;
      if (line.slice(3).trim() === heading) capturing = true;
      continue;
    }
    if (capturing) sectionLines.push(line);
  }
  if (!sectionLines.length) return null;
  const trimmed = sectionLines.join('\n').trim();
  return trimmed || null;
}

/**
 * Extract suggested rules as plain text array (strips surrounding quotes and "- " prefix).
 */
export function extractSuggestedRules(markdown) {
  const sectionNames = ['Suggested Rules', '建议规则'];
  let section = null;
  for (const name of sectionNames) {
    section = extractSection(markdown, name);
    if (section) break;
  }
  if (!section) return [];

  return section
    .split('\n')
    .filter(line => line.startsWith('- '))
    .map(line => line.slice(2).replace(/^[""\u201c]|[""\u201d]$/g, '').trim())
    .filter(Boolean);
}

/**
 * Extract reasoning checkpoints for UserPromptSubmit injection.
 * Tries new headers first, falls back to legacy Thinking Patterns.
 */
export function extractReasoningCheckpoints(markdown) {
  if (!markdown) return null;
  const headers = ['Reasoning Checkpoints', '推理检查点', 'Thinking Patterns', '思维模式'];
  for (const h of headers) {
    const section = extractSection(markdown, h);
    if (section) return section;
  }
  return null;
}

/** @deprecated Use extractReasoningCheckpoints instead */
export function extractThinkingPatterns(markdown) {
  return extractReasoningCheckpoints(markdown);
}

/**
 * Remove specified rules from the Suggested Rules section.
 * Returns the full markdown with those rules removed.
 */
export function removeSuggestedRules(markdown, textsToRemove) {
  const lines = markdown.split('\n');
  const result = [];
  for (const line of lines) {
    if (line.startsWith('- ')) {
      const stripped = line.slice(2).replace(/^[""\u201c]|[""\u201d]$/g, '').trim();
      if (textsToRemove.includes(stripped)) continue;
    }
    result.push(line);
  }
  return result.join('\n');
}
