import { describe, it, expect } from 'vitest';
import { renderInstructions } from '../src/instruction-renderer.js';
import { createDefaultProfile } from '../src/profile.js';

describe('session-start output format', () => {
  it('produces valid JSON with hookSpecificOutput.additionalContext', () => {
    const profile = createDefaultProfile();
    profile.dimensions.risk_tolerance.score = 0.8;
    profile.dimensions.risk_tolerance.confidence = 0.6;

    const instructions = renderInstructions(profile);
    const output = {
      result: 'your-taste: 1 dimensions active',
    };
    if (instructions) {
      output.hookSpecificOutput = { additionalContext: instructions };
    }

    const parsed = JSON.parse(JSON.stringify(output));
    expect(parsed.hookSpecificOutput.additionalContext).toContain('rewrite');
    expect(parsed.result).toContain('your-taste');
  });

  it('omits hookSpecificOutput when no instructions', () => {
    const profile = createDefaultProfile();
    const instructions = renderInstructions(profile);

    const output = { result: 'your-taste: 0 dimensions active' };
    if (instructions) {
      output.hookSpecificOutput = { additionalContext: instructions };
    }

    expect(output.hookSpecificOutput).toBeUndefined();
  });
});
