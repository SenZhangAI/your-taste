import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rm, mkdir, writeFile, readFile } from 'fs/promises';
import { createDefaultProfile, updateProfile, readProfile } from '../src/profile.js';
import { renderInstructions } from '../src/instruction-renderer.js';
import { appendProposal, readProposals, removeProposals } from '../src/proposals.js';
import { writeManagedRules, readManagedRules, appendManagedRules } from '../src/claudemd.js';
import { buildAdditionalContext } from '../src/hooks/session-start.js';

const TEST_DIR = '/tmp/your-taste-integration-test';
const CLAUDE_MD = `${TEST_DIR}/CLAUDE.md`;

describe('end-to-end: profile → render → inject', () => {
  beforeEach(async () => {
    process.env.YOUR_TASTE_DIR = TEST_DIR;
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
    delete process.env.YOUR_TASTE_DIR;
  });

  it('renders instructions from a profile built by multiple signals', async () => {
    const profile = createDefaultProfile();
    const signals = [
      { dimension: 'risk_tolerance', score: 0.85, direction: 'bold', evidence: 'Chose rewrite' },
      { dimension: 'risk_tolerance', score: 0.75, direction: 'bold', evidence: 'Skipped compat' },
      { dimension: 'risk_tolerance', score: 0.9, direction: 'bold', evidence: 'Deleted legacy' },
      { dimension: 'communication_style', score: 0.2, direction: 'direct', evidence: 'Cut explanation' },
      { dimension: 'communication_style', score: 0.15, direction: 'direct', evidence: 'Asked for brevity' },
    ];
    await updateProfile(profile, signals);
    const saved = await readProfile();
    const instructions = renderInstructions(saved);

    expect(instructions).not.toBeNull();
    expect(instructions).toContain('rewrite');
    expect(instructions).toContain('brief');
    expect(instructions).toContain('error handling');
  });

  it('returns null for fresh profile with no evidence', () => {
    const profile = createDefaultProfile();
    const instructions = renderInstructions(profile);
    expect(instructions).toBeNull();
  });
});

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

  it('observations inject via session-start without thinking patterns', async () => {
    await writeFile(`${TEST_DIR}/observations.md`, [
      '## Thinking Patterns',
      '',
      '- **Abstract-first**: thinks in principles',
      '',
      '## Working Principles',
      '',
      '- **Clean breaks**: prefers rewrites',
    ].join('\n'));

    const context = buildAdditionalContext(
      await readFile(`${TEST_DIR}/observations.md`, 'utf8'),
      null,
      null,
    );
    expect(context).toContain('Clean breaks');
    expect(context).not.toContain('Abstract-first');
    expect(context).toContain('error handling'); // quality floor
  });
});
