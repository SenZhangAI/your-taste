import { describe, it, expect } from 'vitest';
import { buildAdditionalContext } from '../src/hooks/session-start.js';

describe('session-start output format', () => {
  it('returns null when no observations, no context', () => {
    const result = buildAdditionalContext(null, null);
    expect(result).toBeNull();
  });

  it('includes observations when available', () => {
    const observations = '## Working Principles\n\n- **Clean breaks**: prefers rewrites over patches';
    const result = buildAdditionalContext(observations, null);
    expect(result).toContain('Clean breaks');
    expect(result).toContain('error handling');
  });

  it('includes project context when available', () => {
    const ctxText = '## Project Context\n\n### Recent Decisions\n- test decision';
    const result = buildAdditionalContext(null, ctxText);
    expect(result).toContain('test decision');
  });

  it('combines observations + context', () => {
    const observations = '## Working Principles\n\n- **Test**: content';
    const ctxText = '## Context\n\n- decision';
    const result = buildAdditionalContext(observations, ctxText);
    expect(result).toContain('Test');
    expect(result).toContain('decision');
  });
});
