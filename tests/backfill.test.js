import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm, utimes } from 'fs/promises';
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
    const sessions = await discoverSessions(TEST_PROJECTS, { all: true });
    expect(sessions).toHaveLength(3);
    expect(sessions.every(s => s.endsWith('.jsonl'))).toBe(true);
  });

  it('ignores subagent transcripts', async () => {
    await writeFile(`${TEST_PROJECTS}/project-a/session1.jsonl`, '{}');
    await mkdir(`${TEST_PROJECTS}/project-a/session1/subagents`, { recursive: true });
    await writeFile(`${TEST_PROJECTS}/project-a/session1/subagents/agent-abc.jsonl`, '{}');
    const sessions = await discoverSessions(TEST_PROJECTS, { all: true });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toContain('session1.jsonl');
  });

  it('returns empty array for nonexistent directory', async () => {
    const sessions = await discoverSessions('/tmp/nonexistent-dir-xyz');
    expect(sessions).toHaveLength(0);
  });

  it('respects maxSessions limit', async () => {
    for (let i = 0; i < 5; i++) {
      await writeFile(`${TEST_PROJECTS}/project-a/session${i}.jsonl`, '{}');
    }
    const sessions = await discoverSessions(TEST_PROJECTS, { maxSessions: 3 });
    expect(sessions).toHaveLength(3);
  });

  it('filters by days', async () => {
    const fresh = `${TEST_PROJECTS}/project-a/fresh.jsonl`;
    const stale = `${TEST_PROJECTS}/project-a/stale.jsonl`;
    await writeFile(fresh, '{}');
    await writeFile(stale, '{}');

    // Set stale file mtime to 60 days ago
    const past = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    await utimes(stale, past, past);

    const sessions = await discoverSessions(TEST_PROJECTS, { days: 30 });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toContain('fresh.jsonl');
  });

  it('sorts by most recent first', async () => {
    const older = `${TEST_PROJECTS}/project-a/older.jsonl`;
    const newer = `${TEST_PROJECTS}/project-a/newer.jsonl`;
    await writeFile(older, '{}');

    // Set older file mtime to 2 days ago
    const past = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await utimes(older, past, past);

    await writeFile(newer, '{}');

    const sessions = await discoverSessions(TEST_PROJECTS, { all: true });
    expect(sessions[0]).toContain('newer.jsonl');
    expect(sessions[1]).toContain('older.jsonl');
  });

  it('defaults to 50 max without explicit filter', async () => {
    // Just verify the default path works (we won't create 51 files)
    await writeFile(`${TEST_PROJECTS}/project-a/s1.jsonl`, '{}');
    await writeFile(`${TEST_PROJECTS}/project-a/s2.jsonl`, '{}');
    const sessions = await discoverSessions(TEST_PROJECTS);
    expect(sessions).toHaveLength(2); // under cap, all returned
  });

  it('prioritizes current project sessions', async () => {
    // project-a has older sessions, but is the "current project"
    const oldA = `${TEST_PROJECTS}/-Users-me-project-a/s1.jsonl`;
    const newB = `${TEST_PROJECTS}/-Users-me-project-b/s2.jsonl`;
    await mkdir(`${TEST_PROJECTS}/-Users-me-project-a`, { recursive: true });
    await mkdir(`${TEST_PROJECTS}/-Users-me-project-b`, { recursive: true });

    await writeFile(oldA, '{}');
    const past = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    await utimes(oldA, past, past);
    await writeFile(newB, '{}');

    // Without priority: newer (project-b) comes first
    const noPriority = await discoverSessions(TEST_PROJECTS, { all: true });
    expect(noPriority[0]).toContain('project-b');

    // With priority: project-a comes first despite being older
    const withPriority = await discoverSessions(TEST_PROJECTS, { all: true }, '/Users/me/project-a');
    expect(withPriority[0]).toContain('project-a');
    expect(withPriority[1]).toContain('project-b');
  });

  it('current project sessions fill max cap first', async () => {
    await mkdir(`${TEST_PROJECTS}/-Users-me-myproj`, { recursive: true });
    await mkdir(`${TEST_PROJECTS}/-Users-me-other`, { recursive: true });

    // Create 3 sessions in current project, 3 in other
    for (let i = 0; i < 3; i++) {
      await writeFile(`${TEST_PROJECTS}/-Users-me-myproj/s${i}.jsonl`, '{}');
      await writeFile(`${TEST_PROJECTS}/-Users-me-other/o${i}.jsonl`, '{}');
    }

    // With max=4, all 3 current-project sessions should be included
    const sessions = await discoverSessions(TEST_PROJECTS, { maxSessions: 4 }, '/Users/me/myproj');
    const currentCount = sessions.filter(s => s.includes('-Users-me-myproj')).length;
    expect(currentCount).toBe(3);
    expect(sessions).toHaveLength(4);
  });
});
