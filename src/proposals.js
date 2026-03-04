import { readFile, appendFile, writeFile, unlink, mkdir } from 'fs/promises';

function getDir() {
  return process.env.YOUR_TASTE_DIR || `${process.env.HOME}/.your-taste`;
}

function getPath() {
  return `${getDir()}/proposals.jsonl`;
}

export async function readProposals() {
  try {
    const content = await readFile(getPath(), 'utf8');
    const seen = new Map();
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        seen.set(entry.rule, entry);
      } catch { /* skip malformed */ }
    }
    return [...seen.values()];
  } catch {
    return [];
  }
}

export async function appendProposal({ rule, evidence, source, scope }) {
  const dir = getDir();
  await mkdir(dir, { recursive: true });

  const existing = await readProposals();
  const entry = { rule, evidence, source, scope, ts: new Date().toISOString() };

  if (existing.some(p => p.rule === rule)) {
    const kept = existing.filter(p => p.rule !== rule);
    kept.push(entry);
    await writeFile(getPath(), kept.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf8');
  } else {
    await appendFile(getPath(), JSON.stringify(entry) + '\n', 'utf8');
  }
}

export async function removeProposals(ruleTexts) {
  const existing = await readProposals();
  const kept = existing.filter(p => !ruleTexts.includes(p.rule));
  if (kept.length === 0) {
    try { await unlink(getPath()); } catch { /* already gone */ }
  } else {
    await writeFile(getPath(), kept.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf8');
  }
}
