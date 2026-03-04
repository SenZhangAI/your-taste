import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';

const START_TAG = '<!-- your-taste:start -->';
const END_TAG = '<!-- your-taste:end -->';
const SECTION_HEADER = '## AI Behavioral Rules (learned by your-taste)';

export async function readManagedRules(filePath) {
  let content;
  try {
    content = await readFile(filePath, 'utf8');
  } catch {
    return [];
  }
  return extractRulesFromSection(content);
}

function extractRulesFromSection(content) {
  const startIdx = content.indexOf(START_TAG);
  const endIdx = content.indexOf(END_TAG);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return [];

  const section = content.slice(startIdx + START_TAG.length, endIdx);
  return section
    .split('\n')
    .filter(line => line.startsWith('- '))
    .map(line => line.slice(2).trim())
    .filter(Boolean);
}

function buildSection(rules) {
  const ruleLines = rules.map(r => `- ${r}`).join('\n');
  return `${START_TAG}\n${SECTION_HEADER}\n\n${ruleLines}\n${END_TAG}`;
}

export async function writeManagedRules(filePath, rules) {
  await mkdir(dirname(filePath), { recursive: true });

  let content;
  try {
    content = await readFile(filePath, 'utf8');
  } catch {
    content = '';
  }

  const section = buildSection(rules);

  const startIdx = content.indexOf(START_TAG);
  const endIdx = content.indexOf(END_TAG);
  if (startIdx !== -1 && endIdx !== -1) {
    content = content.slice(0, startIdx) + section + content.slice(endIdx + END_TAG.length);
  } else {
    content = content.trimEnd() + (content.trim() ? '\n\n' : '') + section + '\n';
  }

  await writeFile(filePath, content, 'utf8');
}

export async function appendManagedRules(filePath, newRules) {
  const existing = await readManagedRules(filePath);
  const deduped = [...existing];
  for (const rule of newRules) {
    if (!deduped.includes(rule)) deduped.push(rule);
  }
  await writeManagedRules(filePath, deduped);
}
