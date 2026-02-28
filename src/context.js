import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const MAX_DECISIONS = 10;
const MAX_QUESTIONS = 5;

function createEmptyContext() {
  return { decisions: [], open_questions: [], last_session: null };
}

// --- Markdown Parsing ---

function parseContextMd(content) {
  const ctx = createEmptyContext();
  if (!content || !content.trim()) return ctx;

  const sections = content.split(/^## /m).slice(1); // split by ## headers

  for (const section of sections) {
    const [header, ...bodyLines] = section.split('\n');
    const body = bodyLines.join('\n').trim();
    const headerLower = header.trim().toLowerCase();

    if (headerLower.startsWith('recent decisions')) {
      ctx.decisions = parseListItems(body);
    } else if (headerLower.startsWith('open questions')) {
      ctx.open_questions = parseListItems(body);
    } else if (headerLower.startsWith('last session')) {
      ctx.last_session = body || null;
    }
  }

  return ctx;
}

function parseListItems(body) {
  const items = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('- ')) continue;
    const content = trimmed.slice(2).trim();

    // Try to extract date: "- [2026-02-28] text" or "- [Feb 28] text"
    const dateMatch = content.match(/^\[([^\]]+)\]\s*(.+)$/);
    if (dateMatch) {
      items.push({ date: parseDateFlexible(dateMatch[1]), text: dateMatch[2] });
    } else {
      items.push({ date: new Date().toISOString().split('T')[0], text: content });
    }
  }
  return items;
}

function parseDateFlexible(dateStr) {
  // Accept "2026-02-28" or "Feb 28" format
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  // If it looks like "Feb 28", parse with current year
  const withYear = new Date(`${dateStr}, ${new Date().getFullYear()}`);
  if (!isNaN(withYear.getTime())) return withYear.toISOString().split('T')[0];
  return new Date().toISOString().split('T')[0];
}

// --- Markdown Writing ---

function renderContextMd(ctx) {
  const lines = ['# Project Context', ''];

  if (ctx.decisions.length > 0) {
    lines.push('## Recent Decisions');
    for (const d of ctx.decisions) {
      lines.push(`- [${d.date}] ${d.text}`);
    }
    lines.push('');
  }

  if (ctx.open_questions.length > 0) {
    lines.push('## Open Questions');
    for (const q of ctx.open_questions) {
      lines.push(`- ${q.text}`);
    }
    lines.push('');
  }

  if (ctx.last_session) {
    lines.push('## Last Session');
    lines.push(ctx.last_session);
    lines.push('');
  }

  return lines.join('\n');
}

// --- Public API ---

export async function loadProjectContext(projectDir) {
  try {
    const content = await readFile(join(projectDir, 'context.md'), 'utf8');
    return parseContextMd(content);
  } catch {
    return createEmptyContext();
  }
}

export async function updateProjectContext(projectDir, sessionContext) {
  const ctx = await loadProjectContext(projectDir);
  const today = new Date().toISOString().split('T')[0];

  // Merge decisions — dedup by text, newest first, FIFO cap
  const existingTexts = new Set(ctx.decisions.map(d => d.text));
  const newDecisions = (sessionContext.decisions || [])
    .filter(t => t && !existingTexts.has(t))
    .map(t => ({ date: today, text: t }));
  ctx.decisions = [...newDecisions, ...ctx.decisions].slice(0, MAX_DECISIONS);

  // Merge open questions — dedup by text, newest first, cap
  const existingQTexts = new Set(ctx.open_questions.map(q => q.text));
  const newQuestions = (sessionContext.open_questions || [])
    .filter(t => t && !existingQTexts.has(t))
    .map(t => ({ date: today, text: t }));
  ctx.open_questions = [...newQuestions, ...ctx.open_questions].slice(0, MAX_QUESTIONS);

  // Last session — overwrite
  if (sessionContext.summary) {
    ctx.last_session = `*${today}* — ${sessionContext.summary}`;
  }

  await mkdir(projectDir, { recursive: true });
  await writeFile(join(projectDir, 'context.md'), renderContextMd(ctx), 'utf8');
  return ctx;
}

export function renderProjectContext(ctx) {
  const sections = [];

  if (ctx.decisions.length > 0) {
    const items = ctx.decisions.map(d => `- ${d.text}`).join('\n');
    sections.push(`### Recent Decisions\n${items}`);
  }

  if (ctx.open_questions.length > 0) {
    const items = ctx.open_questions.map(q => `- ${q.text}`).join('\n');
    sections.push(`### Open Questions\n${items}`);
  }

  if (ctx.last_session) {
    sections.push(`### Last Session\n${ctx.last_session}`);
  }

  if (sections.length === 0) return null;
  return `## Project Context\n\n${sections.join('\n\n')}`;
}
