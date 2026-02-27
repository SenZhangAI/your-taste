import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'fs/promises';
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

  it('adds new rules with count 1', async () => {
    const pending = await readPending();
    const updated = await updatePending(pending, ['Rule A', 'Rule B']);
    expect(updated.rules).toHaveLength(2);
    expect(updated.rules[0].text).toBe('Rule A');
    expect(updated.rules[0].count).toBe(1);
    expect(updated.rules[0].first_seen).toBeDefined();
  });

  it('increments count for exact text match', async () => {
    let pending = await readPending();
    pending = await updatePending(pending, ['Rule A']);
    pending = await readPending();
    pending = await updatePending(pending, ['Rule A']);
    pending = await readPending();
    expect(pending.rules).toHaveLength(1);
    expect(pending.rules[0].count).toBe(2);
  });

  it('handles mix of new and existing rules', async () => {
    let pending = await readPending();
    pending = await updatePending(pending, ['Rule A']);
    pending = await readPending();
    pending = await updatePending(pending, ['Rule A', 'Rule B']);
    pending = await readPending();
    expect(pending.rules).toHaveLength(2);
    expect(pending.rules.find(r => r.text === 'Rule A').count).toBe(2);
    expect(pending.rules.find(r => r.text === 'Rule B').count).toBe(1);
  });

  it('removes rules by text', async () => {
    let pending = await readPending();
    pending = await updatePending(pending, ['Rule A', 'Rule B', 'Rule C']);
    pending = await readPending();
    pending = await removePendingRules(pending, ['Rule A', 'Rule C']);
    pending = await readPending();
    expect(pending.rules).toHaveLength(1);
    expect(pending.rules[0].text).toBe('Rule B');
  });

  it('getPendingRuleTexts returns array of texts', async () => {
    let pending = await readPending();
    pending = await updatePending(pending, ['Rule A', 'Rule B']);
    pending = await readPending();
    const texts = getPendingRuleTexts(pending);
    expect(texts).toEqual(['Rule A', 'Rule B']);
  });
});
