import { readFile, writeFile, mkdir } from 'fs/promises';
import { parse, stringify } from 'yaml';

const MAX_FOCUS = 10;
const MAX_DECISIONS = 15;
const MAX_QUESTIONS = 5;
const FOCUS_TTL_DAYS = 30;
const DECISIONS_TTL_DAYS = 90;
const QUESTIONS_TTL_DAYS = 60;

function getDir() {
  return process.env.YOUR_TASTE_DIR || `${process.env.HOME}/.your-taste`;
}

function getContextPath() {
  return `${getDir()}/context.yaml`;
}

function createEmptyContext() {
  return { focus: [], decisions: [], open_questions: [] };
}

export async function loadContext() {
  try {
    const content = await readFile(getContextPath(), 'utf8');
    const data = parse(content);
    if (!data) return createEmptyContext();
    return {
      focus: data.focus || [],
      decisions: data.decisions || [],
      open_questions: data.open_questions || [],
    };
  } catch {
    return createEmptyContext();
  }
}

export async function updateContext(sessionContext) {
  const ctx = await loadContext();
  const today = new Date().toISOString().split('T')[0];

  const merge = (existing, newTexts, max) => {
    const existingTexts = new Set(existing.map(e => e.text));
    const toAdd = newTexts
      .filter(t => t && !existingTexts.has(t))
      .map(t => ({ date: today, text: t }));
    return [...toAdd, ...existing].slice(0, max);
  };

  ctx.focus = merge(ctx.focus, sessionContext.topics || [], MAX_FOCUS);
  ctx.decisions = merge(ctx.decisions, sessionContext.decisions || [], MAX_DECISIONS);
  ctx.open_questions = merge(ctx.open_questions, sessionContext.open_questions || [], MAX_QUESTIONS);

  const dir = getDir();
  await mkdir(dir, { recursive: true });
  await writeFile(getContextPath(), stringify({ version: 1, ...ctx }), 'utf8');
  return ctx;
}

export async function pruneContext() {
  const ctx = await loadContext();
  const now = Date.now();

  const filterByAge = (entries, ttlDays) =>
    entries.filter(e => {
      const age = (now - new Date(e.date).getTime()) / (1000 * 60 * 60 * 24);
      return age <= ttlDays;
    });

  ctx.focus = filterByAge(ctx.focus, FOCUS_TTL_DAYS);
  ctx.decisions = filterByAge(ctx.decisions, DECISIONS_TTL_DAYS);
  ctx.open_questions = filterByAge(ctx.open_questions, QUESTIONS_TTL_DAYS);

  const dir = getDir();
  await mkdir(dir, { recursive: true });
  await writeFile(getContextPath(), stringify({ version: 1, ...ctx }), 'utf8');
  return ctx;
}

function formatShortDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function renderContext(ctx) {
  const sections = [];

  if (ctx.focus.length > 0) {
    const items = ctx.focus.map(f => `- [${formatShortDate(f.date)}] ${f.text}`).join('\n');
    sections.push(`### Recent Focus\n${items}`);
  }

  if (ctx.decisions.length > 0) {
    const items = ctx.decisions.map(d => `- ${d.text}`).join('\n');
    sections.push(`### Key Decisions\n${items}`);
  }

  if (ctx.open_questions.length > 0) {
    const items = ctx.open_questions.map(q => `- ${q.text}`).join('\n');
    sections.push(`### Open Questions\n${items}`);
  }

  if (sections.length === 0) return null;
  return `## Active Context\n\n${sections.join('\n\n')}`;
}
