import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile, writeFile } from 'fs/promises';
import { readManagedRules, writeManagedRules, appendManagedRules } from '../src/claudemd.js';

const TEST_DIR = '/tmp/your-taste-test-claudemd';
const CLAUDE_MD = `${TEST_DIR}/CLAUDE.md`;

beforeEach(async () => {
  await mkdir(TEST_DIR, { recursive: true });
});

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

describe('claudemd', () => {
  it('returns empty array when no file exists', async () => {
    expect(await readManagedRules(CLAUDE_MD)).toEqual([]);
  });

  it('returns empty array when file has no managed section', async () => {
    await writeFile(CLAUDE_MD, '# My CLAUDE.md\n\nSome content\n');
    expect(await readManagedRules(CLAUDE_MD)).toEqual([]);
  });

  it('reads rules from managed section', async () => {
    await writeFile(CLAUDE_MD, [
      '# My CLAUDE.md',
      '',
      '<!-- your-taste:start -->',
      '## AI Behavioral Rules (learned by your-taste)',
      '',
      '- Rule one',
      '- Rule two',
      '<!-- your-taste:end -->',
      '',
      'Other content',
    ].join('\n'));
    expect(await readManagedRules(CLAUDE_MD)).toEqual(['Rule one', 'Rule two']);
  });

  it('writes managed section to file without existing section', async () => {
    await writeFile(CLAUDE_MD, '# My CLAUDE.md\n\nExisting content\n');
    await writeManagedRules(CLAUDE_MD, ['New rule']);
    const content = await readFile(CLAUDE_MD, 'utf8');
    expect(content).toContain('<!-- your-taste:start -->');
    expect(content).toContain('- New rule');
    expect(content).toContain('<!-- your-taste:end -->');
    expect(content).toContain('Existing content');
  });

  it('replaces existing managed section', async () => {
    await writeFile(CLAUDE_MD, [
      '# Header',
      '<!-- your-taste:start -->',
      '- Old rule',
      '<!-- your-taste:end -->',
      'Footer',
    ].join('\n'));
    await writeManagedRules(CLAUDE_MD, ['New rule']);
    const content = await readFile(CLAUDE_MD, 'utf8');
    expect(content).not.toContain('Old rule');
    expect(content).toContain('- New rule');
    expect(content).toContain('Footer');
  });

  it('appends rules without duplicates', async () => {
    await writeFile(CLAUDE_MD, [
      '<!-- your-taste:start -->',
      '## AI Behavioral Rules (learned by your-taste)',
      '',
      '- Existing rule',
      '<!-- your-taste:end -->',
    ].join('\n'));
    await appendManagedRules(CLAUDE_MD, ['Existing rule', 'New rule']);
    const rules = await readManagedRules(CLAUDE_MD);
    expect(rules).toEqual(['Existing rule', 'New rule']);
  });

  it('creates file if it does not exist', async () => {
    const newPath = `${TEST_DIR}/new-claude.md`;
    await writeManagedRules(newPath, ['First rule']);
    const content = await readFile(newPath, 'utf8');
    expect(content).toContain('- First rule');
  });
});
