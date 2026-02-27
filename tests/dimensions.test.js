import { describe, it, expect } from 'vitest';
import { DIMENSIONS, DIMENSION_NAMES, getNarrative } from '../src/dimensions.js';

describe('dimensions', () => {
  it('all 6 dimensions have personalityNarrative', () => {
    for (const dim of Object.values(DIMENSIONS)) {
      expect(dim.personalityNarrative).toBeDefined();
      expect(dim.personalityNarrative.low).toBeDefined();
      expect(dim.personalityNarrative.high).toBeDefined();
    }
  });

  it('getNarrative returns low narrative for low scores', () => {
    const narrative = getNarrative('risk_tolerance', 0.2);
    expect(narrative).toContain('stability');
  });

  it('getNarrative returns high narrative for high scores', () => {
    const narrative = getNarrative('risk_tolerance', 0.8);
    expect(narrative).toContain('clean breaks');
  });

  it('getNarrative returns null for mid-range scores', () => {
    expect(getNarrative('risk_tolerance', 0.5)).toBeNull();
  });

  it('getNarrative returns null for unknown dimension', () => {
    expect(getNarrative('nonexistent', 0.8)).toBeNull();
  });
});
