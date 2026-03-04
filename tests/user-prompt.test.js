import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { buildUserPromptContext } from '../src/hooks/user-prompt.js';
import { ensureProjectDir } from '../src/project.js';

describe('user-prompt hook priority-based injection', () => {
  let dir;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'taste-up-'));
    process.env.YOUR_TASTE_DIR = dir;
  });

  afterEach(async () => {
    delete process.env.YOUR_TASTE_DIR;
    await rm(dir, { recursive: true });
  });

  it('returns framework when no other data exists', async () => {
    const projectDir = join(dir, 'projects', 'test');
    await mkdir(projectDir, { recursive: true });
    const result = await buildUserPromptContext(projectDir);
    expect(result).toContain('Intent Inference');
  });

  it('includes project context when available', async () => {
    const projectDir = await ensureProjectDir('/test/project2');
    await writeFile(join(projectDir, 'context.md'), '# Project Context\n\n## Recent Decisions\n- [2026-02-28] test decision\n', 'utf8');

    const result = await buildUserPromptContext(projectDir);
    expect(result).toContain('Intent Inference');
    expect(result).toContain('test decision');
  });

  it('includes global context when available', async () => {
    await writeFile(join(dir, 'global-context.md'), '# Cross-Project Focus\n\n- [2026-02-28] cross-project topic\n', 'utf8');
    const projectDir = join(dir, 'projects', 'test');
    await mkdir(projectDir, { recursive: true });

    const result = await buildUserPromptContext(projectDir);
    expect(result).toContain('cross-project topic');
  });

  it('enhances framework with thinking patterns from observations', async () => {
    await writeFile(join(dir, 'observations.md'), [
      '## Thinking Patterns',
      '',
      '- **Abstract-first reasoning**: derives specifics from principles',
      '',
      '## Working Principles',
      '',
      '- Other content',
    ].join('\n'), 'utf8');
    const projectDir = join(dir, 'projects', 'test');
    await mkdir(projectDir, { recursive: true });

    const result = await buildUserPromptContext(projectDir);
    expect(result).toContain('Intent Inference');
    expect(result).toContain("This User's Thinking Patterns");
    expect(result).toContain('Abstract-first reasoning');
    expect(result).not.toContain('Other content');
  });

  it('works without observations file', async () => {
    const projectDir = join(dir, 'projects', 'test');
    await mkdir(projectDir, { recursive: true });

    const result = await buildUserPromptContext(projectDir);
    expect(result).toContain('Intent Inference');
    expect(result).not.toContain("This User's Thinking Patterns");
  });

  it('drops lower-priority content when exceeding max chars', async () => {
    const projectDir = await ensureProjectDir('/test/project3');
    const largeContext = '# Context\n\n## Recent Decisions\n' + Array.from({ length: 20 }, (_, i) => `- [2026-02-28] ${'y'.repeat(200)} ${i}`).join('\n');
    await writeFile(join(projectDir, 'context.md'), largeContext, 'utf8');

    const result = await buildUserPromptContext(projectDir);
    expect(result).toContain('Intent Inference');
    expect(result.length).toBeLessThanOrEqual(5000);
  });
});
