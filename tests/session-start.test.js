import { describe, it, expect } from 'vitest';
import { createDefaultProfile } from '../src/profile.js';
import { buildAdditionalContext } from '../src/hooks/session-start.js';

describe('session-start output format', () => {
  it('produces template instructions when no taste.md', () => {
    const profile = createDefaultProfile();
    profile.dimensions.risk_tolerance.score = 0.8;
    profile.dimensions.risk_tolerance.confidence = 0.6;
    const result = buildAdditionalContext(profile, null, null, null);
    expect(result).toContain('rewrite');
  });

  it('uses taste.md content when available', () => {
    const profile = createDefaultProfile();
    const tasteContent = '# Your Taste\n\n- Custom rule one\n- Custom rule two\n';
    const result = buildAdditionalContext(profile, tasteContent, null, null);
    expect(result).toContain('Custom rule one');
    expect(result).toContain('error handling');
  });

  it('returns null when no instructions and no taste.md', () => {
    const profile = createDefaultProfile();
    const result = buildAdditionalContext(profile, null, null, null);
    expect(result).toBeNull();
  });

  it('includes goal content when available', () => {
    const profile = createDefaultProfile();
    profile.dimensions.risk_tolerance.score = 0.8;
    profile.dimensions.risk_tolerance.confidence = 0.6;
    const goalContent = '# Project Goal\n\n## What\nA test plugin';
    const result = buildAdditionalContext(profile, null, goalContent, null);
    expect(result).toContain('rewrite');
    expect(result).toContain('A test plugin');
  });

  it('includes project context when available', () => {
    const profile = createDefaultProfile();
    profile.dimensions.risk_tolerance.score = 0.8;
    profile.dimensions.risk_tolerance.confidence = 0.6;
    const ctxText = '## Project Context\n\n### Recent Decisions\n- test decision';
    const result = buildAdditionalContext(profile, null, null, ctxText);
    expect(result).toContain('rewrite');
    expect(result).toContain('test decision');
  });
});
