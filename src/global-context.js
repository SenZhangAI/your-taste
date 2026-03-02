import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { readLang, getTemplates } from './lang.js';

const MAX_FOCUS = 5;
const FOCUS_TTL_DAYS = 30;

function getDir() {
  return process.env.YOUR_TASTE_DIR || `${process.env.HOME}/.your-taste`;
}

function getPath() {
  return join(getDir(), 'global-context.md');
}

function parseGlobalContextMd(content) {
  if (!content || !content.trim()) return { focus: [] };
  const focus = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('- ')) continue;
    const match = trimmed.slice(2).match(/^\[([^\]]+)\]\s*(.+)$/);
    if (match) {
      focus.push({ date: match[1], text: match[2] });
    }
  }
  return { focus };
}

function renderGlobalContextMd(ctx, t) {
  const lines = [t.globalContextHeader, ''];
  for (const f of ctx.focus) {
    lines.push(`- [${f.date}] ${f.text}`);
  }
  lines.push('');
  return lines.join('\n');
}

export async function loadGlobalContext() {
  try {
    const content = await readFile(getPath(), 'utf8');
    return parseGlobalContextMd(content);
  } catch {
    return { focus: [] };
  }
}

export async function updateGlobalContext(topics) {
  const ctx = await loadGlobalContext();
  const today = new Date().toISOString().split('T')[0];
  const existingTexts = new Set(ctx.focus.map(f => f.text));
  const newItems = topics
    .filter(t => t && !existingTexts.has(t))
    .map(t => ({ date: today, text: t }));
  ctx.focus = [...newItems, ...ctx.focus].slice(0, MAX_FOCUS);

  const t = getTemplates(await readLang());
  await mkdir(getDir(), { recursive: true });
  await writeFile(getPath(), renderGlobalContextMd(ctx, t), 'utf8');
  return ctx;
}

export async function pruneGlobalContext() {
  const ctx = await loadGlobalContext();
  const now = Date.now();
  ctx.focus = ctx.focus.filter(f => {
    const age = (now - new Date(f.date).getTime()) / (1000 * 60 * 60 * 24);
    return age <= FOCUS_TTL_DAYS;
  });

  const t = getTemplates(await readLang());
  await mkdir(getDir(), { recursive: true });
  await writeFile(getPath(), renderGlobalContextMd(ctx, t), 'utf8');
  return ctx;
}

export async function renderGlobalContext(ctx) {
  if (ctx.focus.length === 0) return null;
  const t = getTemplates(await readLang());
  const items = ctx.focus.map(f => `- ${f.text}`).join('\n');
  return `${t.globalContextInjection}\n${items}`;
}
