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

  it('falls back to base-thinking.md when no thinking-context.md', async () => {
    const projectDir = join(dir, 'projects', 'test');
    await mkdir(projectDir, { recursive: true });
    const result = await buildUserPromptContext(projectDir);
    // base-thinking.md contains Core Reasoning Loop
    expect(result).toContain('Core Reasoning Loop');
    expect(result).toContain('first principles');
  });

  it('uses thinking-context.md when available', async () => {
    await writeFile(join(dir, 'thinking-context.md'), [
      '## Reasoning Checkpoints',
      '',
      '### Core Reasoning Loop',
      '- **Infer A from C.** Trace back to underlying intent.',
      '',
      '<!-- your-taste:start -->',
      '### Evolved Checkpoints',
      '- **Custom checkpoint**: user-specific rule',
      '<!-- your-taste:end -->',
    ].join('\n'), 'utf8');
    const projectDir = join(dir, 'projects', 'test');
    await mkdir(projectDir, { recursive: true });

    const result = await buildUserPromptContext(projectDir);
    expect(result).toContain('Custom checkpoint');
    expect(result).toContain('Infer A from C');
  });

  it('includes project context when available', async () => {
    const projectDir = await ensureProjectDir('/test/project2');
    await writeFile(join(projectDir, 'context.md'), '# Project Context\n\n## Recent Decisions\n- [2026-02-28] test decision\n', 'utf8');

    const result = await buildUserPromptContext(projectDir);
    expect(result).toContain('Core Reasoning Loop');
    expect(result).toContain('test decision');
  });

  it('includes global context when available', async () => {
    await writeFile(join(dir, 'global-context.md'), '# Cross-Project Focus\n\n- [2026-02-28] cross-project topic\n', 'utf8');
    const projectDir = join(dir, 'projects', 'test');
    await mkdir(projectDir, { recursive: true });

    const result = await buildUserPromptContext(projectDir);
    expect(result).toContain('cross-project topic');
  });

  it('drops lower-priority content when exceeding max chars', async () => {
    const projectDir = await ensureProjectDir('/test/project3');
    const largeContext = '# Context\n\n## Recent Decisions\n' + Array.from({ length: 20 }, (_, i) => `- [2026-02-28] ${'y'.repeat(200)} ${i}`).join('\n');
    await writeFile(join(projectDir, 'context.md'), largeContext, 'utf8');

    const result = await buildUserPromptContext(projectDir);
    expect(result).toContain('Core Reasoning Loop');
    expect(result.length).toBeLessThanOrEqual(5000);
  });
});
