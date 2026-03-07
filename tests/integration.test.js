import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rm, mkdir, writeFile, readFile } from 'fs/promises';
import { appendProposal, readProposals, removeProposals } from '../src/proposals.js';
import { writeManagedRules, readManagedRules, appendManagedRules } from '../src/claudemd.js';
import { buildAdditionalContext } from '../src/hooks/session-start.js';

const TEST_DIR = '/tmp/your-taste-integration-test';
const CLAUDE_MD = `${TEST_DIR}/CLAUDE.md`;

describe('end-to-end: proposals → CLAUDE.md pipeline', () => {
  beforeEach(async () => {
    process.env.YOUR_TASTE_DIR = TEST_DIR;
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
    delete process.env.YOUR_TASTE_DIR;
  });

  it('accumulates proposals and deduplicates', async () => {
    await appendProposal({ rule: 'Clean breaks', evidence: 'e1', source: 's1', scope: 'global' });
    await appendProposal({ rule: 'Clean breaks', evidence: 'e2', source: 's2', scope: 'global' });
    await appendProposal({ rule: 'Another rule', evidence: 'e3', source: 's3', scope: 'global' });

    const proposals = await readProposals();
    expect(proposals).toHaveLength(2);
    expect(proposals[0].evidence).toBe('e2'); // latest wins
  });

  it('approved proposals appear in CLAUDE.md', async () => {
    await appendManagedRules(CLAUDE_MD, ['Clean breaks over gradual migration']);

    const rules = await readManagedRules(CLAUDE_MD);
    expect(rules).toContain('Clean breaks over gradual migration');

    const content = await readFile(CLAUDE_MD, 'utf8');
    expect(content).toContain('<!-- your-taste:start -->');
    expect(content).toContain('Clean breaks over gradual migration');
  });

  it('session-start injects project context only', async () => {
    const ctxText = '## Project Context\n\n### Recent Decisions\n- test decision';
    const context = buildAdditionalContext(ctxText);
    expect(context).toContain('test decision');
  });

  it('session-start returns null without project context', () => {
    const context = buildAdditionalContext(null);
    expect(context).toBeNull();
  });
});
