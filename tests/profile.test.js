import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rm, mkdir } from 'fs/promises';
import { createDefaultProfile, updateProfile, readProfile } from '../src/profile.js';

const TEST_DIR = '/tmp/your-taste-test';

describe('profile', () => {
  beforeEach(async () => {
    process.env.YOUR_TASTE_DIR = TEST_DIR;
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
    delete process.env.YOUR_TASTE_DIR;
  });

  it('creates default profile with all dimensions at 0.5', () => {
    const profile = createDefaultProfile();
    expect(profile.version).toBe(1);
    expect(Object.keys(profile.dimensions)).toHaveLength(6);
    for (const dim of Object.values(profile.dimensions)) {
      expect(dim.score).toBe(0.5);
      expect(dim.confidence).toBe(0);
      expect(dim.evidence_count).toBe(0);
    }
  });

  it('updates dimension score with Bayesian weighting', async () => {
    const profile = createDefaultProfile();
    const updated = await updateProfile(profile, [{
      dimension: 'risk_tolerance',
      score: 0.2,
      direction: 'cautious',
      evidence: 'Chose gradual migration over clean break',
    }]);

    expect(updated.dimensions.risk_tolerance.score).toBeLessThan(0.5);
    expect(updated.dimensions.risk_tolerance.evidence_count).toBe(1);
    expect(updated.dimensions.risk_tolerance.confidence).toBeGreaterThan(0);
  });

  it('keeps only last 20 observations', async () => {
    const profile = createDefaultProfile();
    const signals = Array.from({ length: 25 }, (_, i) => ({
      dimension: 'risk_tolerance',
      score: 0.3,
      direction: 'cautious',
      evidence: `Evidence ${i}`,
    }));
    const updated = await updateProfile(profile, signals);
    expect(updated.observations).toHaveLength(20);
  });

  it('reads existing profile from disk', async () => {
    const profile = createDefaultProfile();
    await updateProfile(profile, [{
      dimension: 'autonomy_expectation',
      score: 0.9,
      direction: 'high',
      evidence: 'test',
    }]);

    const loaded = await readProfile();
    expect(loaded.dimensions.autonomy_expectation.evidence_count).toBe(1);
  });
});
