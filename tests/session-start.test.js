import { describe, it, expect } from 'vitest';
import { buildAdditionalContext } from '../src/hooks/session-start.js';

describe('session-start output format', () => {
  it('returns null when no observations, no goal, no context', () => {
    const result = buildAdditionalContext(null, null, null);
    expect(result).toBeNull();
  });

  it('includes observations when available', () => {
    const observations = '## Working Principles\n\n- **Clean breaks**: prefers rewrites over patches';
    const result = buildAdditionalContext(observations, null, null);
    expect(result).toContain('Clean breaks');
    expect(result).toContain('error handling');
  });

  it('includes goal content when available', () => {
    const goalContent = '# Project Goal\n\n## What\nA test plugin';
    const result = buildAdditionalContext(null, goalContent, null);
    expect(result).toContain('A test plugin');
  });

  it('includes project context when available', () => {
    const ctxText = '## Project Context\n\n### Recent Decisions\n- test decision';
    const result = buildAdditionalContext(null, null, ctxText);
    expect(result).toContain('test decision');
  });

  it('combines observations + goal + context', () => {
    const observations = '## Working Principles\n\n- **Test**: content';
    const goalContent = '# Project Goal\n\n## What\nGoal text';
    const ctxText = '## Context\n\n- decision';
    const result = buildAdditionalContext(observations, goalContent, ctxText);
    expect(result).toContain('Test');
    expect(result).toContain('Goal text');
    expect(result).toContain('decision');
  });
});
