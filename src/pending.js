import { readFile, writeFile, mkdir } from 'fs/promises';
import { parse, stringify } from 'yaml';
import { readObservations, extractSuggestedRules } from './observations.js';

function getDir() {
  return process.env.YOUR_TASTE_DIR || `${process.env.HOME}/.your-taste`;
}

function getPendingPath() {
  return `${getDir()}/pending.yaml`;
}

export async function readPending() {
  try {
    const content = await readFile(getPendingPath(), 'utf8');
    return parse(content) || { rules: [] };
  } catch {
    return { rules: [] };
  }
}

export async function updatePending(pending, newRules) {
  const today = new Date().toISOString().split('T')[0];

  for (const rule of newRules) {
    const text = typeof rule === 'string' ? rule : rule.text;
    const evidence = typeof rule === 'string' ? null : (rule.evidence || null);
    const existing = pending.rules.find(r => r.text === text);
    if (existing) {
      existing.count++;
      existing.last_seen = today;
      if (evidence) existing.evidence = evidence;
    } else {
      pending.rules.push({ text, count: 1, first_seen: today, last_seen: today, evidence });
    }
  }

  const dir = getDir();
  await mkdir(dir, { recursive: true });
  await writeFile(getPendingPath(), stringify(pending), 'utf8');
  return pending;
}

export async function removePendingRules(pending, textsToRemove) {
  pending.rules = pending.rules.filter(r => !textsToRemove.includes(r.text));

  const dir = getDir();
  await mkdir(dir, { recursive: true });
  await writeFile(getPendingPath(), stringify(pending), 'utf8');
  return pending;
}

export function getPendingRuleTexts(pending) {
  return pending.rules.map(r => r.text);
}

export async function readPendingFromObservations() {
  const content = await readObservations();
  if (!content) return [];
  return extractSuggestedRules(content);
}
