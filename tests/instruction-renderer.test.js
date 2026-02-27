import { describe, it, expect } from 'vitest';
import { renderInstructions } from '../src/instruction-renderer.js';
import { createDefaultProfile } from '../src/profile.js';

describe('renderInstructions', () => {
  it('returns null for default profile (all scores 0.5, zero confidence)', () => {
    const profile = createDefaultProfile();
    expect(renderInstructions(profile)).toBeNull();
  });

  it('renders instruction for high-confidence bold risk_tolerance', () => {
    const profile = createDefaultProfile();
    profile.dimensions.risk_tolerance.score = 0.8;
    profile.dimensions.risk_tolerance.confidence = 0.6;

    const result = renderInstructions(profile);
    expect(result).toContain('rewrite');
  });

  it('renders instruction for high-confidence cautious risk_tolerance', () => {
    const profile = createDefaultProfile();
    profile.dimensions.risk_tolerance.score = 0.2;
    profile.dimensions.risk_tolerance.confidence = 0.6;

    const result = renderInstructions(profile);
    expect(result).toContain('gradual');
  });

  it('skips mid-range scores (0.35-0.65)', () => {
    const profile = createDefaultProfile();
    profile.dimensions.risk_tolerance.score = 0.5;
    profile.dimensions.risk_tolerance.confidence = 0.9;

    expect(renderInstructions(profile)).toBeNull();
  });

  it('skips dimensions with low confidence (<0.3)', () => {
    const profile = createDefaultProfile();
    profile.dimensions.risk_tolerance.score = 0.9;
    profile.dimensions.risk_tolerance.confidence = 0.1;

    expect(renderInstructions(profile)).toBeNull();
  });

  it('combines multiple active dimensions', () => {
    const profile = createDefaultProfile();
    profile.dimensions.risk_tolerance.score = 0.8;
    profile.dimensions.risk_tolerance.confidence = 0.6;
    profile.dimensions.communication_style.score = 0.15;
    profile.dimensions.communication_style.confidence = 0.5;

    const result = renderInstructions(profile);
    expect(result).toContain('rewrite');
    expect(result).toContain('brief');
  });

  it('always includes quality floor when instructions exist', () => {
    const profile = createDefaultProfile();
    profile.dimensions.risk_tolerance.score = 0.8;
    profile.dimensions.risk_tolerance.confidence = 0.6;

    const result = renderInstructions(profile);
    expect(result).toContain('error handling');
    expect(result).toContain('security');
  });

  it('includes context header when instructions exist', () => {
    const profile = createDefaultProfile();
    profile.dimensions.risk_tolerance.score = 0.8;
    profile.dimensions.risk_tolerance.confidence = 0.6;

    const result = renderInstructions(profile);
    expect(result).toMatch(/working style|preferences/i);
  });
});
