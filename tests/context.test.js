import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { stringify } from 'yaml';
import {
  loadContext,
  updateContext,
  pruneContext,
  renderContext,
} from '../src/context.js';

describe('context storage', () => {
  let dir;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'taste-ctx-'));
    process.env.YOUR_TASTE_DIR = dir;
  });

  afterEach(async () => {
    delete process.env.YOUR_TASTE_DIR;
    await rm(dir, { recursive: true });
  });

  it('returns empty context when file missing', async () => {
    const ctx = await loadContext();
    expect(ctx.focus).toEqual([]);
    expect(ctx.decisions).toEqual([]);
    expect(ctx.open_questions).toEqual([]);
  });

  it('writes and reads context entries', async () => {
    await updateContext({
      topics: ['product repositioning'],
      decisions: ['use YAML for storage'],
      open_questions: ['size limits'],
    });
    const ctx = await loadContext();
    expect(ctx.focus).toHaveLength(1);
    expect(ctx.focus[0].text).toBe('product repositioning');
    expect(ctx.decisions).toHaveLength(1);
    expect(ctx.open_questions).toHaveLength(1);
  });

  it('deduplicates by exact text match', async () => {
    await updateContext({ topics: ['topic A'], decisions: [], open_questions: [] });
    await updateContext({ topics: ['topic A', 'topic B'], decisions: [], open_questions: [] });
    const ctx = await loadContext();
    expect(ctx.focus).toHaveLength(2);
    expect(ctx.focus.map(f => f.text)).toContain('topic A');
    expect(ctx.focus.map(f => f.text)).toContain('topic B');
  });

  it('respects max entry limits', async () => {
    // focus max is 10
    for (let i = 0; i < 12; i++) {
      await updateContext({ topics: [`topic ${i}`], decisions: [], open_questions: [] });
    }
    const ctx = await loadContext();
    expect(ctx.focus.length).toBeLessThanOrEqual(10);
    // newest entries kept (topic 11, 10, 9...)
    expect(ctx.focus[0].text).toBe('topic 11');
  });

  it('prunes expired entries', async () => {
    await updateContext({ topics: ['old topic'], decisions: ['old decision'], open_questions: [] });
    // Manually backdate the entries
    const ctx = await loadContext();
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 31); // 31 days ago — past 30-day focus TTL
    ctx.focus[0].date = oldDate.toISOString().split('T')[0];
    const oldDecDate = new Date();
    oldDecDate.setDate(oldDecDate.getDate() - 91); // past 90-day decision TTL
    ctx.decisions[0].date = oldDecDate.toISOString().split('T')[0];

    // Write backdated context, then prune
    await writeFile(join(dir, 'context.yaml'), stringify({ version: 1, ...ctx }), 'utf8');

    await pruneContext();
    const pruned = await loadContext();
    expect(pruned.focus).toHaveLength(0);
    expect(pruned.decisions).toHaveLength(0);
  });
});

describe('context rendering', () => {
  let dir;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'taste-ctx-'));
    process.env.YOUR_TASTE_DIR = dir;
  });

  afterEach(async () => {
    delete process.env.YOUR_TASTE_DIR;
    await rm(dir, { recursive: true });
  });

  it('returns null when context is empty', async () => {
    const result = renderContext(await loadContext());
    expect(result).toBeNull();
  });

  it('renders focus with short dates, decisions without dates', async () => {
    await updateContext({
      topics: ['context accelerator design'],
      decisions: ['use YAML storage'],
      open_questions: ['size limits'],
    });
    const ctx = await loadContext();
    const rendered = renderContext(ctx);
    expect(rendered).toContain('## Active Context');
    expect(rendered).toContain('### Recent Focus');
    expect(rendered).toContain('context accelerator design');
    expect(rendered).toContain('### Key Decisions');
    expect(rendered).toContain('use YAML storage');
    expect(rendered).toContain('### Open Questions');
    expect(rendered).toContain('size limits');
  });

  it('omits empty sections', async () => {
    await updateContext({ topics: ['only focus'], decisions: [], open_questions: [] });
    const ctx = await loadContext();
    const rendered = renderContext(ctx);
    expect(rendered).toContain('### Recent Focus');
    expect(rendered).not.toContain('### Key Decisions');
    expect(rendered).not.toContain('### Open Questions');
  });
});
