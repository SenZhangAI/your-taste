import { describe, it, expect } from 'vitest';
import { renderInstructions } from '../src/instruction-renderer.js';
import { createDefaultProfile } from '../src/profile.js';
import { buildAdditionalContext } from '../src/hooks/session-start.js';

describe('session-start output format', () => {
  it('produces template instructions when no taste.md', () => {
    const profile = createDefaultProfile();
    profile.dimensions.risk_tolerance.score = 0.8;
    profile.dimensions.risk_tolerance.confidence = 0.6;
    const result = buildAdditionalContext(profile, null);
    expect(result).toContain('rewrite');
  });

  it('uses taste.md content when available', () => {
    const profile = createDefaultProfile();
    const tasteContent = '# Your Taste\n\n- Custom rule one\n- Custom rule two\n';
    const result = buildAdditionalContext(profile, tasteContent);
    expect(result).toContain('Custom rule one');
    expect(result).toContain('error handling'); // quality floor still present
  });

  it('returns null when no instructions and no taste.md', () => {
    const profile = createDefaultProfile();
    const result = buildAdditionalContext(profile, null);
    expect(result).toBeNull();
  });
});
