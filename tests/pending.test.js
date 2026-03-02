import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'fs/promises';
import { readPending, updatePending, removePendingRules, getPendingRuleTexts } from '../src/pending.js';

const TEST_DIR = '/tmp/your-taste-test-pending';

describe('pending rules', () => {
  beforeEach(async () => {
    process.env.YOUR_TASTE_DIR = TEST_DIR;
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
    delete process.env.YOUR_TASTE_DIR;
  });

  it('returns empty rules for missing file', async () => {
    const pending = await readPending();
    expect(pending.rules).toEqual([]);
  });

  it('adds new rules with evidence and count 1', async () => {
    const pending = await readPending();
    const updated = await updatePending(pending, [
      { text: 'Rule A', evidence: 'Did X instead of Y' },
      { text: 'Rule B', evidence: 'Consistently chose Z' },
    ]);
    expect(updated.rules).toHaveLength(2);
    expect(updated.rules[0].text).toBe('Rule A');
    expect(updated.rules[0].count).toBe(1);
    expect(updated.rules[0].evidence).toBe('Did X instead of Y');
    expect(updated.rules[0].first_seen).toBeDefined();
  });

  it('increments count and updates evidence on match', async () => {
    let pending = await readPending();
    pending = await updatePending(pending, [{ text: 'Rule A', evidence: 'first time' }]);
    pending = await readPending();
    pending = await updatePending(pending, [{ text: 'Rule A', evidence: 'second time' }]);
    pending = await readPending();
    expect(pending.rules).toHaveLength(1);
    expect(pending.rules[0].count).toBe(2);
    expect(pending.rules[0].evidence).toBe('second time');
  });

  it('handles legacy string format', async () => {
    const pending = await readPending();
    const updated = await updatePending(pending, ['Legacy Rule']);
    expect(updated.rules[0].text).toBe('Legacy Rule');
    expect(updated.rules[0].evidence).toBeNull();
  });

  it('handles mix of new and existing rules', async () => {
    let pending = await readPending();
    pending = await updatePending(pending, [{ text: 'Rule A', evidence: 'ev1' }]);
    pending = await readPending();
    pending = await updatePending(pending, [
      { text: 'Rule A', evidence: 'ev2' },
      { text: 'Rule B', evidence: 'ev3' },
    ]);
    pending = await readPending();
    expect(pending.rules).toHaveLength(2);
    expect(pending.rules.find(r => r.text === 'Rule A').count).toBe(2);
    expect(pending.rules.find(r => r.text === 'Rule B').count).toBe(1);
  });

  it('removes rules by text', async () => {
    let pending = await readPending();
    pending = await updatePending(pending, [
      { text: 'Rule A', evidence: 'a' },
      { text: 'Rule B', evidence: 'b' },
      { text: 'Rule C', evidence: 'c' },
    ]);
    pending = await readPending();
    pending = await removePendingRules(pending, ['Rule A', 'Rule C']);
    pending = await readPending();
    expect(pending.rules).toHaveLength(1);
    expect(pending.rules[0].text).toBe('Rule B');
  });

  it('reads suggested rules from observations.md', async () => {
    const obsContent = `## Thinking Patterns

- **Test**: content

## Suggested Rules

- "Act independently after plan confirmation"
- "Trace full usage path for parameters"`;

    await writeFile(`${TEST_DIR}/observations.md`, obsContent);

    const { readPendingFromObservations } = await import('../src/pending.js');
    const rules = await readPendingFromObservations();
    expect(rules).toEqual([
      'Act independently after plan confirmation',
      'Trace full usage path for parameters',
    ]);
  });

  it('getPendingRuleTexts returns array of texts', async () => {
    let pending = await readPending();
    pending = await updatePending(pending, [
      { text: 'Rule A', evidence: 'a' },
      { text: 'Rule B', evidence: 'b' },
    ]);
    pending = await readPending();
    const texts = getPendingRuleTexts(pending);
    expect(texts).toEqual(['Rule A', 'Rule B']);
  });
});
