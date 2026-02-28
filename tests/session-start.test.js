import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderInstructions } from '../src/instruction-renderer.js';
import { createDefaultProfile } from '../src/profile.js';
import { buildAdditionalContext } from '../src/hooks/session-start.js';
import { updateContext, loadContext, renderContext } from '../src/context.js';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

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

describe('session-start with context', () => {
  let dir;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'taste-ss-'));
    process.env.YOUR_TASTE_DIR = dir;
  });

  afterEach(async () => {
    delete process.env.YOUR_TASTE_DIR;
    await rm(dir, { recursive: true });
  });

  it('includes context in additionalContext when available', async () => {
    await updateContext({ topics: ['test focus'], decisions: [], open_questions: [] });
    const profile = createDefaultProfile();
    profile.dimensions.risk_tolerance.score = 0.8;
    profile.dimensions.risk_tolerance.confidence = 0.6;
    const ctx = await loadContext();
    const result = buildAdditionalContext(profile, null, ctx);
    expect(result).toContain('rewrite'); // template instruction
    expect(result).toContain('test focus'); // context
  });

  it('works without context', () => {
    const profile = createDefaultProfile();
    profile.dimensions.risk_tolerance.score = 0.8;
    profile.dimensions.risk_tolerance.confidence = 0.6;
    const result = buildAdditionalContext(profile, null, null);
    expect(result).toContain('rewrite');
    expect(result).not.toContain('Active Context');
  });
});
