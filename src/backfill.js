import { readdir, stat, readFile, writeFile, mkdir, open } from 'fs/promises';
import { join, dirname } from 'path';
import { parseTranscript, extractConversation } from './transcript.js';
import { filterSensitiveData } from './privacy.js';
import { analyzeTranscript } from './analyzer.js';
import { createDefaultProfile, updateProfile } from './profile.js';
import { debug } from './debug.js';

const DEFAULT_MAX_SESSIONS = 50;
const MAX_CONSECUTIVE_FAILURES = 3;
const PROCESSED_PATH = `${process.env.HOME}/.your-taste/processed.json`;

// Sessions smaller than this are almost always junk (session starts without real interaction).
// Viable sessions are typically 14KB+; junk (too few messages, too short) median 5-7KB.
const MIN_FILE_SIZE = 10_000;

// Signature to detect meta-sessions (taste init's own claude -p calls persisted as JSONL).
// Checked against the first line of each file — cheap O(1) read, no full parse needed.
const META_SESSION_SIGNATURE = 'You are a session analyst';

/**
 * Convert a filesystem path to its Claude Code project directory name.
 * Claude Code uses the pattern: /Users/sen/ai/foo → -Users-sen-ai-foo
 */
function toClaudeProjectDirName(fsPath) {
  return fsPath.replace(/\//g, '-');
}

/**
 * Check if a session file is a meta-session (from taste init's own claude -p calls).
 * Reads only the first line — O(1) regardless of file size.
 */
async function isMetaSession(filePath) {
  let fh;
  try {
    fh = await open(filePath, 'r');
    const buf = Buffer.alloc(512);
    const { bytesRead } = await fh.read(buf, 0, 512, 0);
    const firstLine = buf.toString('utf8', 0, bytesRead).split('\n')[0];
    return firstLine.includes(META_SESSION_SIGNATURE);
  } catch {
    return false;
  } finally {
    await fh?.close();
  }
}

/**
 * Scan projectsDir for JSONL session transcript files.
 * Returns paths sorted by mtime (most recent first), filtered by options.
 * When currentProjectPath is provided, sessions from that project sort first.
 *
 * @param {string} projectsDir
 * @param {object} [filter]
 * @param {number} [filter.maxSessions] - Cap on number of sessions to return
 * @param {number} [filter.days] - Only include sessions modified within this many days
 * @param {boolean} [filter.all] - Ignore limits, return everything
 * @param {string} [currentProjectPath] - Filesystem path of current project (for priority sorting)
 */
export async function discoverSessions(projectsDir, filter = {}, currentProjectPath = null) {
  let projectDirs;
  try {
    projectDirs = await readdir(projectsDir);
  } catch {
    return [];
  }

  const currentDirName = currentProjectPath ? toClaudeProjectDirName(currentProjectPath) : null;
  if (currentDirName) debug(`discover: current project dir name = ${currentDirName}`);

  const sessions = [];

  for (const projectName of projectDirs) {
    const projectPath = join(projectsDir, projectName);
    const info = await stat(projectPath).catch(() => null);
    if (!info?.isDirectory()) continue;

    const isCurrentProject = projectName === currentDirName;
    const entries = await readdir(projectPath);
    for (const entry of entries) {
      if (!entry.endsWith('.jsonl')) continue;
      const fullPath = join(projectPath, entry);
      const fileStat = await stat(fullPath).catch(() => null);
      if (!fileStat || fileStat.size < (filter.minSize ?? MIN_FILE_SIZE)) continue;
      if (await isMetaSession(fullPath)) continue;
      sessions.push({ path: fullPath, mtime: fileStat.mtimeMs, isCurrentProject });
    }
  }

  // Sort: current project first (by mtime), then others (by mtime)
  sessions.sort((a, b) => {
    if (a.isCurrentProject !== b.isCurrentProject) return a.isCurrentProject ? -1 : 1;
    return b.mtime - a.mtime;
  });

  let filtered = sessions;

  if (!filter.all) {
    // Apply days filter
    if (filter.days) {
      const cutoff = Date.now() - filter.days * 24 * 60 * 60 * 1000;
      filtered = filtered.filter(s => s.mtime >= cutoff);
    }

    // Apply max sessions cap (default 50)
    const max = filter.maxSessions || DEFAULT_MAX_SESSIONS;
    filtered = filtered.slice(0, max);
  }

  const currentCount = filtered.filter(s => s.isCurrentProject).length;
  if (currentDirName && currentCount > 0) {
    debug(`discover: ${currentCount} sessions from current project prioritized`);
  }

  return filtered.map(s => s.path);
}

/**
 * Load the set of already-processed session paths.
 * Prevents re-analyzing the same sessions on repeated init runs.
 */
async function loadProcessed() {
  try {
    const data = await readFile(PROCESSED_PATH, 'utf8');
    const arr = JSON.parse(data);
    return new Set(arr);
  } catch {
    return new Set();
  }
}

async function saveProcessed(set) {
  await mkdir(dirname(PROCESSED_PATH), { recursive: true });
  await writeFile(PROCESSED_PATH, JSON.stringify([...set]));
}

// Conversation text beyond this is truncated (keep tail — recent interactions have richer signal)
const MAX_CONVERSATION_CHARS = 30_000;

/**
 * Process a single session transcript through the analysis pipeline.
 * Returns { signals, context } or { signals: [] } if the session is too short.
 */
export async function processSession(transcriptPath) {
  debug(`session: processing ${transcriptPath}`);
  const messages = await parseTranscript(transcriptPath);
  if (messages.length < 4) {
    debug(`session: skipped (${messages.length} messages < 4)`);
    return { signals: [] };
  }

  let conversation = extractConversation(messages, { compact: true });
  if (conversation.length < 200) {
    debug(`session: skipped (conversation ${conversation.length} chars < 200)`);
    return { signals: [] };
  }

  // Skip meta-sessions: these are taste init's own claude -p calls persisted as session files
  if (conversation.includes('You are a session analyst')) {
    debug(`session: skipped (meta-session from previous taste init)`);
    return { signals: [] };
  }

  // Safety net: truncate if still too long after compact extraction
  if (conversation.length > MAX_CONVERSATION_CHARS) {
    debug(`session: truncating ${conversation.length} → ${MAX_CONVERSATION_CHARS} chars (keeping tail)`);
    conversation = '...(earlier conversation truncated)...\n\n' + conversation.slice(-MAX_CONVERSATION_CHARS);
  }

  const filtered = filterSensitiveData(conversation);
  debug(`session: analyzing ${filtered.length} chars (${messages.length} messages)`);
  const { signals, context } = await analyzeTranscript(filtered);
  debug(`session: done — ${signals.length} signals`);
  return { signals, context };
}

/**
 * Orchestrate full backfill: discover sessions, analyze one at a time, build profile.
 *
 * Sequential processing (no concurrency) — each `claude -p` subprocess is heavy.
 * Fail-fast: aborts after MAX_CONSECUTIVE_FAILURES consecutive LLM failures.
 * Tracks processed sessions to avoid re-analyzing on repeated runs.
 */
export async function backfill(projectsDir, options = {}) {
  const { onProgress, filter, currentProjectPath } = options;

  const sessionPaths = await discoverSessions(projectsDir, filter, currentProjectPath);

  // Skip already-processed sessions
  const alreadyProcessed = await loadProcessed();
  const toProcess = sessionPaths.filter(p => !alreadyProcessed.has(p));
  const skipCount = sessionPaths.length - toProcess.length;
  if (skipCount > 0) debug(`backfill: skipping ${skipCount} already-processed sessions`);

  const total = toProcess.length;
  debug(`backfill: ${total} sessions to process (sequential)`);

  let processed = 0;
  let skipped = 0;
  let consecutiveFailures = 0;
  const allSignals = [];

  for (let i = 0; i < total; i++) {
    const sessionPath = toProcess[i];

    try {
      const result = await processSession(sessionPath);
      if (result.signals.length > 0) {
        allSignals.push(...result.signals);
        processed++;
      } else {
        skipped++;
      }
      consecutiveFailures = 0;
      // Mark as processed (even if no signals — it was analyzed successfully)
      alreadyProcessed.add(sessionPath);
      await saveProcessed(alreadyProcessed);
    } catch (err) {
      debug(`backfill: FAILED ${sessionPath} — ${err.message}`);
      skipped++;
      consecutiveFailures++;

      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        debug(`backfill: aborting — ${MAX_CONSECUTIVE_FAILURES} consecutive failures`);
        onProgress?.({ processed, skipped, total: total + skipCount, current: i + 1, aborted: true });
        break;
      }
    }

    onProgress?.({ processed, skipped, total: total + skipCount, current: i + 1 + skipCount });
  }

  if (allSignals.length === 0) return null;

  const profile = createDefaultProfile();
  await updateProfile(profile, allSignals);
  return { profile, processed, skipped: skipped + skipCount, total: total + skipCount };
}
