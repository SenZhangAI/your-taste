import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'fs/promises';
import { appendProposal, readProposals, removeProposals } from '../src/proposals.js';

const TEST_DIR = '/tmp/your-taste-test-proposals';

beforeEach(async () => {
  process.env.YOUR_TASTE_DIR = TEST_DIR;
  await mkdir(TEST_DIR, { recursive: true });
});

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
  delete process.env.YOUR_TASTE_DIR;
});

describe('proposals', () => {
  it('returns empty array when no file exists', async () => {
    expect(await readProposals()).toEqual([]);
  });

  it('appends a proposal with auto-timestamp', async () => {
    await appendProposal({
      rule: 'Recommend one best approach',
      evidence: 'User said: just pick one',
      source: '/path/to/session.jsonl',
      scope: 'global',
    });
    const proposals = await readProposals();
    expect(proposals).toHaveLength(1);
    expect(proposals[0].rule).toBe('Recommend one best approach');
    expect(proposals[0].ts).toBeTruthy();
  });

  it('appends multiple proposals with different scopes', async () => {
    await appendProposal({ rule: 'Rule 1', evidence: 'e1', source: 's1', scope: 'global' });
    await appendProposal({ rule: 'Rule 2', evidence: 'e2', source: 's2', scope: 'project:foo' });
    const proposals = await readProposals();
    expect(proposals).toHaveLength(2);
    expect(proposals[1].scope).toBe('project:foo');
  });

  it('removes proposals by rule text', async () => {
    await appendProposal({ rule: 'Keep', evidence: 'e', source: 's', scope: 'global' });
    await appendProposal({ rule: 'Remove me', evidence: 'e', source: 's', scope: 'global' });
    await appendProposal({ rule: 'Also keep', evidence: 'e', source: 's', scope: 'global' });
    await removeProposals(['Remove me']);
    const proposals = await readProposals();
    expect(proposals).toHaveLength(2);
    expect(proposals.map(p => p.rule)).toEqual(['Keep', 'Also keep']);
  });

  it('deduplicates proposals with same rule text', async () => {
    await appendProposal({ rule: 'Same rule', evidence: 'first', source: 's1', scope: 'global' });
    await appendProposal({ rule: 'Same rule', evidence: 'second', source: 's2', scope: 'global' });
    const proposals = await readProposals();
    expect(proposals).toHaveLength(1);
    expect(proposals[0].evidence).toBe('second');
  });
});
