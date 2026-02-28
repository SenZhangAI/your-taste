import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  loadGlobalContext,
  updateGlobalContext,
  renderGlobalContext,
} from '../src/global-context.js';

describe('global context (Markdown)', () => {
  let dir;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'taste-gc-'));
    process.env.YOUR_TASTE_DIR = dir;
  });

  afterEach(async () => {
    delete process.env.YOUR_TASTE_DIR;
    await rm(dir, { recursive: true });
  });

  it('returns empty when file missing', async () => {
    const ctx = await loadGlobalContext();
    expect(ctx.focus).toEqual([]);
  });

  it('writes and reads as Markdown', async () => {
    await updateGlobalContext(['your-taste repositioning']);
    const ctx = await loadGlobalContext();
    expect(ctx.focus).toHaveLength(1);
    expect(ctx.focus[0].text).toBe('your-taste repositioning');
  });

  it('produces valid Markdown file', async () => {
    await updateGlobalContext(['topic one']);
    const raw = await readFile(join(dir, 'global-context.md'), 'utf8');
    expect(raw).toContain('# Cross-Project Focus');
    expect(raw).toContain('- [');
    expect(raw).toContain('topic one');
  });

  it('deduplicates by text', async () => {
    await updateGlobalContext(['topic A']);
    await updateGlobalContext(['topic A', 'topic B']);
    const ctx = await loadGlobalContext();
    expect(ctx.focus).toHaveLength(2);
  });

  it('enforces max 5 entries', async () => {
    for (let i = 0; i < 7; i++) {
      await updateGlobalContext([`topic ${i}`]);
    }
    const ctx = await loadGlobalContext();
    expect(ctx.focus).toHaveLength(5);
    expect(ctx.focus[0].text).toBe('topic 6');
  });

  it('prunes entries older than 30 days', async () => {
    await updateGlobalContext(['old topic']);
    // Manually backdate
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 31);
    const content = `# Cross-Project Focus\n\n- [${oldDate.toISOString().split('T')[0]}] old topic\n`;
    await writeFile(join(dir, 'global-context.md'), content, 'utf8');

    const { pruneGlobalContext } = await import('../src/global-context.js');
    await pruneGlobalContext();
    const ctx = await loadGlobalContext();
    expect(ctx.focus).toHaveLength(0);
  });

  it('renders for injection', async () => {
    await updateGlobalContext(['project A work']);
    const ctx = await loadGlobalContext();
    const rendered = renderGlobalContext(ctx);
    expect(rendered).toContain('Cross-Project Focus');
    expect(rendered).toContain('project A work');
  });

  it('returns null when empty', async () => {
    const ctx = await loadGlobalContext();
    expect(renderGlobalContext(ctx)).toBeNull();
  });
});
