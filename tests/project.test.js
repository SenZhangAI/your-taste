import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { parse } from 'yaml';
import {
  getProjectName,
  getProjectDir,
  ensureProjectDir,
} from '../src/project.js';

describe('project directory management', () => {
  let dir;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'taste-proj-'));
    process.env.YOUR_TASTE_DIR = dir;
  });

  afterEach(async () => {
    delete process.env.YOUR_TASTE_DIR;
    await rm(dir, { recursive: true });
  });

  it('derives project name from last path component', () => {
    expect(getProjectName('/Users/sen/ai/your-taste')).toBe('your-taste');
    expect(getProjectName('/Users/sen/ai/nuoshi-backend')).toBe('nuoshi-backend');
  });

  it('handles trailing slashes', () => {
    expect(getProjectName('/Users/sen/ai/your-taste/')).toBe('your-taste');
  });

  it('returns project dir path under YOUR_TASTE_DIR', () => {
    const result = getProjectDir('/Users/sen/ai/your-taste');
    expect(result).toBe(join(dir, 'projects', 'your-taste'));
  });

  it('creates project directory and updates index', async () => {
    const projectPath = '/Users/sen/ai/your-taste';
    const projectDir = await ensureProjectDir(projectPath);

    expect(projectDir).toBe(join(dir, 'projects', 'your-taste'));

    // index.yaml should map name → path
    const indexContent = await readFile(join(dir, 'projects', 'index.yaml'), 'utf8');
    const index = parse(indexContent);
    expect(index['your-taste']).toBe(projectPath);
  });

  it('reuses existing project directory on second call', async () => {
    const projectPath = '/Users/sen/ai/your-taste';
    await ensureProjectDir(projectPath);
    await ensureProjectDir(projectPath);

    const indexContent = await readFile(join(dir, 'projects', 'index.yaml'), 'utf8');
    const index = parse(indexContent);
    // Should still have one entry, not duplicated
    expect(Object.keys(index)).toHaveLength(1);
  });

  it('handles name collision by appending path hash', async () => {
    await ensureProjectDir('/Users/sen/project-a/myapp');
    await ensureProjectDir('/Users/sen/project-b/myapp');

    const indexContent = await readFile(join(dir, 'projects', 'index.yaml'), 'utf8');
    const index = parse(indexContent);
    // Both should exist, second gets a suffix
    expect(Object.keys(index)).toHaveLength(2);
    expect(index['myapp']).toBe('/Users/sen/project-a/myapp');
    // Second one has hash suffix
    const keys = Object.keys(index).filter(k => k.startsWith('myapp'));
    expect(keys).toHaveLength(2);
  });
});
