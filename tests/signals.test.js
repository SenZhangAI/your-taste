import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'fs/promises';
import { appendSignals, readAllSignals, collectForSynthesis, clearSignals } from '../src/signals.js';

const TEST_DIR = '/tmp/your-taste-test-signals';

describe('signals intermediate storage', () => {
  beforeEach(async () => {
    process.env.YOUR_TASTE_DIR = TEST_DIR;
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
    delete process.env.YOUR_TASTE_DIR;
  });

  it('returns empty when no signals file exists', async () => {
    const { entries, sessions } = await readAllSignals();
    expect(entries).toEqual([]);
    expect(sessions.size).toBe(0);
  });

  it('appends and reads back signals', async () => {
    const dp = [{ ai_proposed: 'x', user_reacted: 'y', strength: 'correction', dimension: 'risk_tolerance', principle: 'test' }];
    await appendSignals('/path/session1.jsonl', dp);
    await appendSignals('/path/session2.jsonl', []);

    const { entries, sessions } = await readAllSignals();
    expect(entries).toHaveLength(2);
    expect(sessions.has('/path/session1.jsonl')).toBe(true);
    expect(sessions.has('/path/session2.jsonl')).toBe(true);
    expect(entries[0].decision_points).toHaveLength(1);
  });

  it('clears signals file', async () => {
    await appendSignals('/path/s.jsonl', []);
    await clearSignals();
    const { entries } = await readAllSignals();
    expect(entries).toEqual([]);
  });

  it('clearSignals is safe when file does not exist', async () => {
    await clearSignals(); // should not throw
  });

  it('collectForSynthesis flattens and caps decision points', () => {
    const entries = [];
    for (let i = 0; i < 10; i++) {
      const dps = Array.from({ length: 6 }, (_, j) => ({
        ai_proposed: `proposal ${i}-${j}`,
        user_reacted: `reaction ${i}-${j}`,
        strength: j < 2 ? 'rejection' : 'correction',
        dimension: 'risk_tolerance',
        principle: `User prefers approach ${i}-${j} over alternatives`,
      }));
      entries.push({ session: `/s${i}.jsonl`, decision_points: dps });
    }

    const result = collectForSynthesis(entries);
    expect(result.length).toBe(25); // capped
    // Rejections should sort before corrections
    expect(result[0].strength).toBe('rejection');
  });

  it('collectForSynthesis preserves all when under cap', () => {
    const entries = [
      { session: '/s.jsonl', decision_points: [
        { ai_proposed: 'a', user_reacted: 'b', strength: 'correction', dimension: 'risk_tolerance', principle: 'Direct execution over exploratory searching' },
      ]},
    ];
    const result = collectForSynthesis(entries);
    expect(result).toHaveLength(1);
  });

  it('collectForSynthesis filters out short principles', () => {
    const entries = [
      { session: '/s.jsonl', decision_points: [
        { strength: 'correction', dimension: 'risk_tolerance', principle: 'too short' },
        { strength: 'rejection', dimension: 'risk_tolerance', principle: 'This is a meaningful principle about user behavior' },
      ]},
    ];
    const result = collectForSynthesis(entries);
    expect(result).toHaveLength(1);
    expect(result[0].strength).toBe('rejection');
  });
});
