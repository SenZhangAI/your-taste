import { describe, it, expect } from 'vitest';
import { buildAdditionalContext } from '../src/hooks/session-start.js';

describe('session-start output format', () => {
  it('returns null when no project context', () => {
    const result = buildAdditionalContext(null);
    expect(result).toBeNull();
  });

  it('includes project context when available', () => {
    const ctxText = '## Project Context\n\n### Recent Decisions\n- test decision';
    const result = buildAdditionalContext(ctxText);
    expect(result).toContain('test decision');
  });
});
