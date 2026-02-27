import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'fs/promises';
import { discoverSessions } from '../src/backfill.js';

const TEST_PROJECTS = '/tmp/your-taste-test-projects';

describe('backfill session discovery', () => {
  beforeEach(async () => {
    await mkdir(`${TEST_PROJECTS}/project-a`, { recursive: true });
    await mkdir(`${TEST_PROJECTS}/project-b`, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_PROJECTS, { recursive: true, force: true });
  });

  it('finds JSONL files in project directories', async () => {
    await writeFile(`${TEST_PROJECTS}/project-a/session1.jsonl`, '{}');
    await writeFile(`${TEST_PROJECTS}/project-a/session2.jsonl`, '{}');
    await writeFile(`${TEST_PROJECTS}/project-b/session3.jsonl`, '{}');
    const sessions = await discoverSessions(TEST_PROJECTS);
    expect(sessions).toHaveLength(3);
    expect(sessions.every(s => s.endsWith('.jsonl'))).toBe(true);
  });

  it('ignores subagent transcripts', async () => {
    await writeFile(`${TEST_PROJECTS}/project-a/session1.jsonl`, '{}');
    await mkdir(`${TEST_PROJECTS}/project-a/session1/subagents`, { recursive: true });
    await writeFile(`${TEST_PROJECTS}/project-a/session1/subagents/agent-abc.jsonl`, '{}');
    const sessions = await discoverSessions(TEST_PROJECTS);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toContain('session1.jsonl');
  });

  it('returns empty array for nonexistent directory', async () => {
    const sessions = await discoverSessions('/tmp/nonexistent-dir-xyz');
    expect(sessions).toHaveLength(0);
  });
});
