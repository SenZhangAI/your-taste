import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm, utimes } from 'fs/promises';
import { discoverSessions, prepareConversation } from '../src/backfill.js';

const TEST_PROJECTS = '/tmp/your-taste-test-projects';

// Minimal valid session content — enough for isMetaSession to see a real user message
const VALID_SESSION = '{"type":"user","message":{"role":"user","content":[{"type":"text","text":"hello"}]}}\n{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"hi"}]}}';

describe('backfill session discovery', () => {
  beforeEach(async () => {
    await mkdir(`${TEST_PROJECTS}/project-a`, { recursive: true });
    await mkdir(`${TEST_PROJECTS}/project-b`, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_PROJECTS, { recursive: true, force: true });
  });

  it('finds JSONL files in project directories', async () => {
    await writeFile(`${TEST_PROJECTS}/project-a/session1.jsonl`, VALID_SESSION);
    await writeFile(`${TEST_PROJECTS}/project-a/session2.jsonl`, VALID_SESSION);
    await writeFile(`${TEST_PROJECTS}/project-b/session3.jsonl`, VALID_SESSION);
    const sessions = await discoverSessions(TEST_PROJECTS, { all: true, minSize: 0 });
    expect(sessions).toHaveLength(3);
    expect(sessions.every(s => s.path.endsWith('.jsonl'))).toBe(true);
    expect(sessions.every(s => typeof s.mtime === 'number')).toBe(true);
  });

  it('ignores subagent transcripts', async () => {
    await writeFile(`${TEST_PROJECTS}/project-a/session1.jsonl`, VALID_SESSION);
    await mkdir(`${TEST_PROJECTS}/project-a/session1/subagents`, { recursive: true });
    await writeFile(`${TEST_PROJECTS}/project-a/session1/subagents/agent-abc.jsonl`, VALID_SESSION);
    const sessions = await discoverSessions(TEST_PROJECTS, { all: true, minSize: 0 });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].path).toContain('session1.jsonl');
  });

  it('returns empty array for nonexistent directory', async () => {
    const sessions = await discoverSessions('/tmp/nonexistent-dir-xyz');
    expect(sessions).toHaveLength(0);
  });

  it('respects maxSessions limit', async () => {
    for (let i = 0; i < 5; i++) {
      await writeFile(`${TEST_PROJECTS}/project-a/session${i}.jsonl`, VALID_SESSION);
    }
    const sessions = await discoverSessions(TEST_PROJECTS, { maxSessions: 3, minSize: 0 });
    expect(sessions).toHaveLength(3);
  });

  it('noCap bypasses maxSessions default cap', async () => {
    for (let i = 0; i < 5; i++) {
      await writeFile(`${TEST_PROJECTS}/project-a/session${i}.jsonl`, VALID_SESSION);
    }
    // maxSessions: 3 caps at 3
    const capped = await discoverSessions(TEST_PROJECTS, { maxSessions: 3, minSize: 0 });
    expect(capped).toHaveLength(3);

    // noCap returns all despite maxSessions
    const all = await discoverSessions(TEST_PROJECTS, { maxSessions: 3, noCap: true, minSize: 0 });
    expect(all).toHaveLength(5);
  });

  it('noCap preserves days filter', async () => {
    const fresh = `${TEST_PROJECTS}/project-a/fresh.jsonl`;
    const stale = `${TEST_PROJECTS}/project-a/stale.jsonl`;
    await writeFile(fresh, VALID_SESSION);
    await writeFile(stale, VALID_SESSION);

    const past = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    await utimes(stale, past, past);

    const sessions = await discoverSessions(TEST_PROJECTS, { days: 30, noCap: true, minSize: 0 });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].path).toContain('fresh.jsonl');
  });

  it('filters by days', async () => {
    const fresh = `${TEST_PROJECTS}/project-a/fresh.jsonl`;
    const stale = `${TEST_PROJECTS}/project-a/stale.jsonl`;
    await writeFile(fresh, VALID_SESSION);
    await writeFile(stale, VALID_SESSION);

    // Set stale file mtime to 60 days ago
    const past = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    await utimes(stale, past, past);

    const sessions = await discoverSessions(TEST_PROJECTS, { days: 30, minSize: 0 });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].path).toContain('fresh.jsonl');
  });

  it('sorts by most recent first', async () => {
    const older = `${TEST_PROJECTS}/project-a/older.jsonl`;
    const newer = `${TEST_PROJECTS}/project-a/newer.jsonl`;
    await writeFile(older, VALID_SESSION);

    // Set older file mtime to 2 days ago
    const past = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await utimes(older, past, past);

    await writeFile(newer, VALID_SESSION);

    const sessions = await discoverSessions(TEST_PROJECTS, { all: true, minSize: 0 });
    expect(sessions[0].path).toContain('newer.jsonl');
    expect(sessions[1].path).toContain('older.jsonl');
  });

  it('defaults to 50 max without explicit filter', async () => {
    // Just verify the default path works (we won't create 51 files)
    await writeFile(`${TEST_PROJECTS}/project-a/s1.jsonl`, VALID_SESSION);
    await writeFile(`${TEST_PROJECTS}/project-a/s2.jsonl`, VALID_SESSION);
    const sessions = await discoverSessions(TEST_PROJECTS, { minSize: 0 });
    expect(sessions).toHaveLength(2); // under cap, all returned
  });

  it('prioritizes current project sessions', async () => {
    // project-a has older sessions, but is the "current project"
    const oldA = `${TEST_PROJECTS}/-Users-me-project-a/s1.jsonl`;
    const newB = `${TEST_PROJECTS}/-Users-me-project-b/s2.jsonl`;
    await mkdir(`${TEST_PROJECTS}/-Users-me-project-a`, { recursive: true });
    await mkdir(`${TEST_PROJECTS}/-Users-me-project-b`, { recursive: true });

    await writeFile(oldA, VALID_SESSION);
    const past = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    await utimes(oldA, past, past);
    await writeFile(newB, VALID_SESSION);

    // Without priority: newer (project-b) comes first
    const noPriority = await discoverSessions(TEST_PROJECTS, { all: true, minSize: 0 });
    expect(noPriority[0].path).toContain('project-b');

    // With priority: project-a comes first despite being older
    const withPriority = await discoverSessions(TEST_PROJECTS, { all: true, minSize: 0 }, '/Users/me/project-a');
    expect(withPriority[0].path).toContain('project-a');
    expect(withPriority[1].path).toContain('project-b');
  });

  it('current project sessions fill max cap first', async () => {
    await mkdir(`${TEST_PROJECTS}/-Users-me-myproj`, { recursive: true });
    await mkdir(`${TEST_PROJECTS}/-Users-me-other`, { recursive: true });

    // Create 3 sessions in current project, 3 in other
    for (let i = 0; i < 3; i++) {
      await writeFile(`${TEST_PROJECTS}/-Users-me-myproj/s${i}.jsonl`, VALID_SESSION);
      await writeFile(`${TEST_PROJECTS}/-Users-me-other/o${i}.jsonl`, VALID_SESSION);
    }

    // With max=4, all 3 current-project sessions should be included
    const sessions = await discoverSessions(TEST_PROJECTS, { maxSessions: 4, minSize: 0 }, '/Users/me/myproj');
    const currentCount = sessions.filter(s => s.path.includes('-Users-me-myproj')).length;
    expect(currentCount).toBe(3);
    expect(sessions).toHaveLength(4);
  });
});

describe('prepareConversation', () => {
  it('returns null for too few messages', () => {
    const result = prepareConversation([{ type: 'user', content: 'hi' }]);
    expect(result).toBeNull();
  });

  it('returns null for too-short conversations', () => {
    const messages = [
      { type: 'user', content: 'You are a JSON-only signal extractor. Analyze this.' },
      { type: 'assistant', content: '{"decision_points": []}' },
      { type: 'user', content: 'next session' },
      { type: 'assistant', content: '{"decision_points": []}' },
    ];
    const result = prepareConversation(messages);
    expect(result).toBeNull();
  });

  it('returns conversation text for valid sessions', () => {
    const messages = [
      { type: 'user', content: 'Please refactor the authentication module to use JWT' },
      { type: 'assistant', content: 'I will restructure the auth module with JWT tokens and refresh flow' },
      { type: 'user', content: 'Good, but use httpOnly cookies for the refresh token, not localStorage' },
      { type: 'assistant', content: 'Updated to use httpOnly cookies for refresh tokens for better security' },
    ];
    const result = prepareConversation(messages);
    expect(result).toBeTruthy();
    expect(result).toContain('refactor');
  });
});
