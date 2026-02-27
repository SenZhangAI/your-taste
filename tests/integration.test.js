import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rm, mkdir } from 'fs/promises';
import { createDefaultProfile, updateProfile, readProfile } from '../src/profile.js';
import { renderInstructions } from '../src/instruction-renderer.js';
import { readPending, updatePending } from '../src/pending.js';
import { readTasteFile, appendRules } from '../src/taste-file.js';
import { buildAdditionalContext } from '../src/hooks/session-start.js';

const TEST_DIR = '/tmp/your-taste-integration-test';

describe('end-to-end: profile → render → inject', () => {
  beforeEach(async () => {
    process.env.YOUR_TASTE_DIR = TEST_DIR;
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
    delete process.env.YOUR_TASTE_DIR;
  });

  it('renders instructions from a profile built by multiple signals', async () => {
    const profile = createDefaultProfile();
    const signals = [
      { dimension: 'risk_tolerance', score: 0.85, direction: 'bold', evidence: 'Chose rewrite' },
      { dimension: 'risk_tolerance', score: 0.75, direction: 'bold', evidence: 'Skipped compat' },
      { dimension: 'risk_tolerance', score: 0.9, direction: 'bold', evidence: 'Deleted legacy' },
      { dimension: 'communication_style', score: 0.2, direction: 'direct', evidence: 'Cut explanation' },
      { dimension: 'communication_style', score: 0.15, direction: 'direct', evidence: 'Asked for brevity' },
    ];
    await updateProfile(profile, signals);
    const saved = await readProfile();
    const instructions = renderInstructions(saved);

    expect(instructions).not.toBeNull();
    expect(instructions).toContain('rewrite');
    expect(instructions).toContain('brief');
    expect(instructions).toContain('error handling');
  });

  it('returns null for fresh profile with no evidence', () => {
    const profile = createDefaultProfile();
    const instructions = renderInstructions(profile);
    expect(instructions).toBeNull();
  });
});

describe('end-to-end: rule accumulation pipeline', () => {
  beforeEach(async () => {
    process.env.YOUR_TASTE_DIR = TEST_DIR;
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
    delete process.env.YOUR_TASTE_DIR;
  });

  it('accumulates rules and surfaces them after threshold', async () => {
    let pending = await readPending();

    // Simulate 3 sessions extracting the same rule
    pending = await updatePending(pending, ['Clean breaks over gradual migration']);
    pending = await readPending();
    pending = await updatePending(pending, ['Clean breaks over gradual migration']);
    pending = await readPending();
    pending = await updatePending(pending, ['Clean breaks over gradual migration']);
    pending = await readPending();

    const rule = pending.rules.find(r => r.text === 'Clean breaks over gradual migration');
    expect(rule.count).toBe(3);
  });

  it('approved rules appear in taste.md and get injected', async () => {
    await appendRules(['Clean breaks over gradual migration']);

    const tasteContent = await readTasteFile();
    expect(tasteContent).toContain('Clean breaks over gradual migration');

    const profile = createDefaultProfile();
    const context = buildAdditionalContext(profile, tasteContent);
    expect(context).toContain('Clean breaks over gradual migration');
    expect(context).toContain('error handling'); // quality floor
  });

  it('falls back to template when no taste.md', async () => {
    const profile = createDefaultProfile();
    profile.dimensions.risk_tolerance.score = 0.8;
    profile.dimensions.risk_tolerance.confidence = 0.6;

    const context = buildAdditionalContext(profile, null);
    expect(context).toContain('rewrite'); // template instruction
  });
});
