import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'fs/promises';
import { readTasteFile, appendRules } from '../src/taste-file.js';

const TEST_DIR = '/tmp/your-taste-test-tastefile';

describe('taste file', () => {
  beforeEach(async () => {
    process.env.YOUR_TASTE_DIR = TEST_DIR;
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
    delete process.env.YOUR_TASTE_DIR;
  });

  it('returns null for missing taste.md', async () => {
    expect(await readTasteFile()).toBeNull();
  });

  it('returns null for empty taste.md', async () => {
    await writeFile(`${TEST_DIR}/taste.md`, '', 'utf8');
    expect(await readTasteFile()).toBeNull();
  });

  it('reads existing taste.md content', async () => {
    await writeFile(`${TEST_DIR}/taste.md`, '# Your Taste\n\n- Rule A\n', 'utf8');
    const content = await readTasteFile();
    expect(content).toContain('Rule A');
  });

  it('creates taste.md with header when appending to nonexistent file', async () => {
    await appendRules(['Rule A', 'Rule B']);
    const content = await readTasteFile();
    expect(content).toContain('# Your Taste');
    expect(content).toContain('- Rule A');
    expect(content).toContain('- Rule B');
  });

  it('appends rules to existing taste.md', async () => {
    await writeFile(`${TEST_DIR}/taste.md`, '# Your Taste\n\n- Existing rule\n', 'utf8');
    await appendRules(['New rule']);
    const content = await readTasteFile();
    expect(content).toContain('- Existing rule');
    expect(content).toContain('- New rule');
  });

  it('does not duplicate rules already in taste.md', async () => {
    await writeFile(`${TEST_DIR}/taste.md`, '# Your Taste\n\n- Rule A\n', 'utf8');
    await appendRules(['Rule A', 'Rule B']);
    const content = await readTasteFile();
    const matches = content.match(/Rule A/g);
    expect(matches).toHaveLength(1);
    expect(content).toContain('- Rule B');
  });
});
