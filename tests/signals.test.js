import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readdir, readFile } from 'fs/promises';
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
    const gaps = [{ what_ai_did: 'x', what_broke: 'y', strength: 'correction', category: 'risk_tolerance', checkpoint: 'test checkpoint text here' }];
    await appendSignals('/path/session1.jsonl', gaps);
    await appendSignals('/path/session2.jsonl', []);

    const { entries, sessions } = await readAllSignals();
    expect(entries).toHaveLength(2);
    expect(sessions.has('/path/session1.jsonl')).toBe(true);
    expect(sessions.has('/path/session2.jsonl')).toBe(true);
    expect(entries[0].reasoning_gaps).toHaveLength(1);
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

  it('collectForSynthesis flattens and caps reasoning gaps', () => {
    const entries = [];
    for (let i = 0; i < 10; i++) {
      const gaps = Array.from({ length: 6 }, (_, j) => ({
        what_ai_did: `proposal ${i}-${j}`,
        what_broke: `reaction ${i}-${j}`,
        strength: j < 2 ? 'rejection' : 'correction',
        category: 'risk_tolerance',
        checkpoint: `User prefers approach ${i}-${j} over alternatives`,
      }));
      entries.push({ session: `/s${i}.jsonl`, reasoning_gaps: gaps });
    }

    const result = collectForSynthesis(entries);
    expect(result.length).toBe(25); // capped
    // Rejections should sort before corrections
    expect(result[0].strength).toBe('rejection');
  });

  it('collectForSynthesis preserves all when under cap', () => {
    const entries = [
      { session: '/s.jsonl', reasoning_gaps: [
        { what_ai_did: 'a', what_broke: 'b', strength: 'correction', category: 'risk_tolerance', checkpoint: 'Direct execution over exploratory searching' },
      ]},
    ];
    const result = collectForSynthesis(entries);
    expect(result).toHaveLength(1);
  });

  it('collectForSynthesis filters out short checkpoints', () => {
    const entries = [
      { session: '/s.jsonl', reasoning_gaps: [
        { strength: 'correction', category: 'risk_tolerance', checkpoint: 'too short' },
        { strength: 'rejection', category: 'risk_tolerance', checkpoint: 'This is a meaningful checkpoint about user behavior' },
      ]},
    ];
    const result = collectForSynthesis(entries);
    expect(result).toHaveLength(1);
    expect(result[0].strength).toBe('rejection');
  });

  it('collectForSynthesis reads legacy decision_points format', () => {
    const entries = [
      { session: '/s.jsonl', decision_points: [
        { ai_proposed: 'a', user_reacted: 'b', strength: 'correction', dimension: 'risk_tolerance', principle: 'Direct execution over exploratory searching' },
        { ai_proposed: 'c', user_reacted: 'd', strength: 'rejection', dimension: 'code_style', principle: 'short' },
      ]},
    ];
    const result = collectForSynthesis(entries);
    // Legacy principle field used for quality filter — 'short' is < 15 chars
    expect(result).toHaveLength(1);
    expect(result[0].principle).toBe('Direct execution over exploratory searching');
  });

  it('collectForSynthesis handles mixed old and new format entries', () => {
    const entries = [
      { session: '/s1.jsonl', reasoning_gaps: [
        { what_ai_did: 'x', what_broke: 'y', strength: 'rejection', category: 'verification_skip', checkpoint: 'Verify join key semantics before writing queries' },
      ]},
      { session: '/s2.jsonl', decision_points: [
        { ai_proposed: 'a', user_reacted: 'b', strength: 'correction', dimension: 'risk_tolerance', principle: 'Direct execution over exploratory searching' },
      ]},
    ];
    const result = collectForSynthesis(entries);
    expect(result).toHaveLength(2);
    // rejection sorts before correction
    expect(result[0].strength).toBe('rejection');
    expect(result[0].checkpoint).toBe('Verify join key semantics before writing queries');
    expect(result[1].strength).toBe('correction');
    expect(result[1].principle).toBe('Direct execution over exploratory searching');
  });

  it('clearSignals archives meaningful entries to history/', async () => {
    const gaps = [{ what_ai_did: 'x', what_broke: 'y', strength: 'correction', category: 'verification_skip', checkpoint: 'test checkpoint text here' }];
    await appendSignals('/path/session1.jsonl', gaps);
    await appendSignals('/path/session2.jsonl', []); // empty — should be excluded from archive

    await clearSignals();

    // Original file should be gone
    const { entries } = await readAllSignals();
    expect(entries).toEqual([]);

    // History dir should have archived file with only meaningful entries
    const historyDir = `${TEST_DIR}/history`;
    const files = await readdir(historyDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^init-signals-.*\.jsonl$/);

    const archived = await readFile(`${historyDir}/${files[0]}`, 'utf8');
    const lines = archived.trim().split('\n');
    expect(lines).toHaveLength(1); // only the entry with gaps
    const parsed = JSON.parse(lines[0]);
    expect(parsed.reasoning_gaps).toHaveLength(1);
  });
});
