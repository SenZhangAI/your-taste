import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadGoal, renderGoalForInjection } from '../src/goal.js';

describe('goal module', () => {
  let dir;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'taste-goal-'));
    process.env.YOUR_TASTE_DIR = dir;
  });

  afterEach(async () => {
    delete process.env.YOUR_TASTE_DIR;
    await rm(dir, { recursive: true });
  });

  it('returns null when goal.md does not exist', async () => {
    const projectDir = join(dir, 'projects', 'test-project');
    await mkdir(projectDir, { recursive: true });
    const result = await loadGoal(projectDir);
    expect(result).toBeNull();
  });

  it('reads goal.md content as-is', async () => {
    const projectDir = join(dir, 'projects', 'test-project');
    await mkdir(projectDir, { recursive: true });
    const goalContent = `# Project Goal

## What
A test project for demonstrations

## Constraints
- Must be simple
- No external dependencies`;
    await writeFile(join(projectDir, 'goal.md'), goalContent, 'utf8');

    const result = await loadGoal(projectDir);
    expect(result).toBe(goalContent);
  });

  it('returns null for empty goal.md', async () => {
    const projectDir = join(dir, 'projects', 'test-project');
    await mkdir(projectDir, { recursive: true });
    await writeFile(join(projectDir, 'goal.md'), '', 'utf8');

    const result = await loadGoal(projectDir);
    expect(result).toBeNull();
  });

  it('renders goal with injection header', () => {
    const goalContent = '# Project Goal\n\n## What\nA plugin';
    const rendered = renderGoalForInjection(goalContent);
    expect(rendered).toContain('Project Goal');
    expect(rendered).toContain('A plugin');
  });

  it('renderGoalForInjection returns null for null input', () => {
    expect(renderGoalForInjection(null)).toBeNull();
  });
});
