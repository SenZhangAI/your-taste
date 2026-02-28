import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  loadProjectContext,
  updateProjectContext,
  renderProjectContext,
} from '../src/context.js';

describe('project context storage (Markdown)', () => {
  let projectDir;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'taste-ctx-'));
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true });
  });

  it('returns empty context when file missing', async () => {
    const ctx = await loadProjectContext(projectDir);
    expect(ctx.decisions).toEqual([]);
    expect(ctx.open_questions).toEqual([]);
    expect(ctx.last_session).toBeNull();
  });

  it('writes and reads context as Markdown', async () => {
    await updateProjectContext(projectDir, {
      decisions: ['use Markdown for storage'],
      open_questions: ['size limits'],
      summary: 'Implemented context refactor',
    });
    const ctx = await loadProjectContext(projectDir);
    expect(ctx.decisions).toHaveLength(1);
    expect(ctx.decisions[0].text).toBe('use Markdown for storage');
    expect(ctx.open_questions).toHaveLength(1);
    expect(ctx.open_questions[0].text).toBe('size limits');
    expect(ctx.last_session).toContain('Implemented context refactor');
  });

  it('produces valid Markdown file', async () => {
    await updateProjectContext(projectDir, {
      decisions: ['decision one'],
      open_questions: ['question one'],
      summary: 'Did stuff',
    });
    const raw = await readFile(join(projectDir, 'context.md'), 'utf8');
    expect(raw).toContain('# Project Context');
    expect(raw).toContain('## Recent Decisions');
    expect(raw).toContain('- [');
    expect(raw).toContain('decision one');
    expect(raw).toContain('## Open Questions');
    expect(raw).toContain('question one');
    expect(raw).toContain('## Last Session');
    expect(raw).toContain('Did stuff');
  });

  it('deduplicates decisions by text', async () => {
    await updateProjectContext(projectDir, { decisions: ['same decision'], open_questions: [], summary: null });
    await updateProjectContext(projectDir, { decisions: ['same decision', 'new one'], open_questions: [], summary: null });
    const ctx = await loadProjectContext(projectDir);
    expect(ctx.decisions).toHaveLength(2);
    const texts = ctx.decisions.map(d => d.text);
    expect(texts.filter(t => t === 'same decision')).toHaveLength(1);
  });

  it('enforces FIFO limit of 10 decisions', async () => {
    for (let i = 0; i < 12; i++) {
      await updateProjectContext(projectDir, { decisions: [`decision ${i}`], open_questions: [], summary: null });
    }
    const ctx = await loadProjectContext(projectDir);
    expect(ctx.decisions).toHaveLength(10);
    // newest first
    expect(ctx.decisions[0].text).toBe('decision 11');
  });

  it('enforces limit of 5 open questions', async () => {
    for (let i = 0; i < 7; i++) {
      await updateProjectContext(projectDir, { decisions: [], open_questions: [`question ${i}`], summary: null });
    }
    const ctx = await loadProjectContext(projectDir);
    expect(ctx.open_questions).toHaveLength(5);
    expect(ctx.open_questions[0].text).toBe('question 6');
  });

  it('last_session is overwritten each time', async () => {
    await updateProjectContext(projectDir, { decisions: [], open_questions: [], summary: 'first session' });
    await updateProjectContext(projectDir, { decisions: [], open_questions: [], summary: 'second session' });
    const ctx = await loadProjectContext(projectDir);
    expect(ctx.last_session).toContain('second session');
    expect(ctx.last_session).not.toContain('first session');
  });

  it('parses back a manually edited context.md', async () => {
    // Simulate user editing the file directly
    const manualContent = `# Project Context

## Recent Decisions
- [2026-02-28] user added this manually
- [2026-02-27] older decision

## Open Questions
- is this working?

## Last Session
*2026-02-28* — Manual session note
`;
    await writeFile(join(projectDir, 'context.md'), manualContent, 'utf8');
    const ctx = await loadProjectContext(projectDir);
    expect(ctx.decisions).toHaveLength(2);
    expect(ctx.decisions[0].text).toBe('user added this manually');
    expect(ctx.open_questions).toHaveLength(1);
    expect(ctx.last_session).toContain('Manual session note');
  });
});

describe('project context rendering', () => {
  let projectDir;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'taste-ctx-'));
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true });
  });

  it('returns null when context is empty', async () => {
    const ctx = await loadProjectContext(projectDir);
    expect(renderProjectContext(ctx)).toBeNull();
  });

  it('renders decisions and questions for injection', async () => {
    await updateProjectContext(projectDir, {
      decisions: ['use Markdown'],
      open_questions: ['size limit?'],
      summary: 'Did work',
    });
    const ctx = await loadProjectContext(projectDir);
    const rendered = renderProjectContext(ctx);
    expect(rendered).toContain('Recent Decisions');
    expect(rendered).toContain('use Markdown');
    expect(rendered).toContain('Open Questions');
    expect(rendered).toContain('size limit?');
    expect(rendered).toContain('Last Session');
  });

  it('omits empty sections', async () => {
    await updateProjectContext(projectDir, { decisions: ['only decisions'], open_questions: [], summary: null });
    const ctx = await loadProjectContext(projectDir);
    const rendered = renderProjectContext(ctx);
    expect(rendered).toContain('Recent Decisions');
    expect(rendered).not.toContain('Open Questions');
    expect(rendered).not.toContain('Last Session');
  });
});
