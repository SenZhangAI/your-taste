import { readFile, writeFile, mkdir } from 'fs/promises';

function getDir() {
  return process.env.YOUR_TASTE_DIR || `${process.env.HOME}/.your-taste`;
}

export function getTasteFilePath() {
  return `${getDir()}/taste.md`;
}

export async function readTasteFile() {
  try {
    const content = await readFile(getTasteFilePath(), 'utf8');
    return content.trim() || null;
  } catch {
    return null;
  }
}

export async function appendRules(rules) {
  const dir = getDir();
  await mkdir(dir, { recursive: true });

  let content = await readTasteFile();

  if (!content) {
    content = '# Your Taste\n';
  }

  const existingRules = content.match(/^- .+$/gm) || [];
  const existingTexts = existingRules.map(r => r.slice(2));

  const newRules = rules.filter(r => !existingTexts.includes(r));
  if (newRules.length === 0) return;

  const additions = newRules.map(r => `- ${r}`).join('\n');
  content = content.trimEnd() + '\n' + additions + '\n';

  await writeFile(getTasteFilePath(), content, 'utf8');
}
