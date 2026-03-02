import { readdir, stat, readFile, writeFile, mkdir, open } from 'fs/promises';
import { join, dirname } from 'path';
import { parseTranscript, extractConversation } from './transcript.js';
import { filterSensitiveData } from './privacy.js';
import { extractSignals, synthesizeProfile } from './analyzer.js';
import { createDefaultProfile, updateProfile } from './profile.js';
import { readPending, updatePending, getPendingRuleTexts } from './pending.js';
import { appendSignals, readAllSignals, collectForSynthesis, clearSignals } from './signals.js';
import { hasLangFile, writeLang } from './lang.js';
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

// Also detect the new Pass 1 prompt signature
const META_SESSION_SIGNATURES = ['You are a session analyst', 'You are a JSON-only signal extractor'];

/**
 * Prepare a session transcript for analysis.
 * Returns filtered conversation text, or null if the session should be skipped.
 */
export function prepareConversation(messages) {
  if (messages.length < 4) return null;

  let conversation = extractConversation(messages, { compact: true });
  if (conversation.length < 200) return null;

  // Skip meta-sessions
  for (const sig of META_SESSION_SIGNATURES) {
    if (conversation.includes(sig)) return null;
  }

  if (conversation.length > MAX_CONVERSATION_CHARS) {
    conversation = '...(earlier conversation truncated)...\n\n' + conversation.slice(-MAX_CONVERSATION_CHARS);
  }

  return filterSensitiveData(conversation);
}

/**
 * Pass 1: Extract decision points from a single session.
 * Returns { decisionPoints, context } or null if session is not viable.
 */
async function pass1Session(transcriptPath) {
  debug(`pass1: processing ${transcriptPath}`);
  const messages = await parseTranscript(transcriptPath);
  const conversation = prepareConversation(messages);
  if (!conversation) {
    debug(`pass1: skipped (not viable)`);
    return null;
  }

  debug(`pass1: extracting signals from ${conversation.length} chars (${messages.length} messages)`);
  const { decisionPoints, context, userLanguage } = await extractSignals(conversation);
  debug(`pass1: done — ${decisionPoints.length} decision points${userLanguage ? `, lang=${userLanguage}` : ''}`);
  return { decisionPoints, context, userLanguage };
}

/**
 * Orchestrate full backfill with two-pass architecture.
 *
 * Pass 1: Per-session signal extraction → persisted to init-signals.jsonl
 *         Interruption-safe: resumes from where it left off.
 * Pass 2: Unified synthesis from all accumulated decision points → profile + pending
 *
 * Sequential processing — each `claude -p` subprocess is heavy.
 * Fail-fast: aborts Pass 1 after MAX_CONSECUTIVE_FAILURES consecutive LLM failures.
 */
export async function backfill(projectsDir, options = {}) {
  const { onProgress, filter, currentProjectPath } = options;

  const sessionPaths = await discoverSessions(projectsDir, filter, currentProjectPath);

  // Skip fully-processed sessions (completed both passes in a previous run)
  const alreadyProcessed = await loadProcessed();
  const toProcess = sessionPaths.filter(p => !alreadyProcessed.has(p));
  const skipCount = sessionPaths.length - toProcess.length;
  if (skipCount > 0) debug(`backfill: skipping ${skipCount} fully-processed sessions`);

  // Check which sessions already completed Pass 1 (from an interrupted previous run)
  const { sessions: pass1Done } = await readAllSignals();
  const needPass1 = toProcess.filter(p => !pass1Done.has(p));
  const pass1Resumed = toProcess.length - needPass1.length;
  if (pass1Resumed > 0) debug(`backfill: resuming — ${pass1Resumed} sessions already have Pass 1 results`);

  const total = toProcess.length;
  debug(`backfill: ${needPass1.length} sessions need Pass 1, ${total} total for Pass 2`);

  // --- Pass 1: Extract decision points per session ---
  let extracted = pass1Resumed;
  let skipped = 0;
  let consecutiveFailures = 0;
  let langDetected = false;

  for (let i = 0; i < needPass1.length; i++) {
    const sessionPath = needPass1[i];

    try {
      const result = await pass1Session(sessionPath);
      if (result && result.decisionPoints.length > 0) {
        await appendSignals(sessionPath, result.decisionPoints, result.context);
        extracted++;
      } else {
        // No decision points but session was processed — record to avoid re-processing
        await appendSignals(sessionPath, [], result?.context || null);
        skipped++;
      }

      // Auto-detect language from first session that reports one
      if (!langDetected && result?.userLanguage) {
        langDetected = true;
        if (!(await hasLangFile())) {
          await writeLang(result.userLanguage);
          debug(`backfill: auto-detected language "${result.userLanguage}"`);
        }
      }

      consecutiveFailures = 0;
    } catch (err) {
      debug(`pass1: FAILED ${sessionPath} — ${err.message}`);
      skipped++;
      consecutiveFailures++;

      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        debug(`backfill: aborting Pass 1 — ${MAX_CONSECUTIVE_FAILURES} consecutive failures`);
        onProgress?.({ phase: 'pass1', extracted, skipped, total: total + skipCount, current: i + 1, aborted: true });
        break;
      }
    }

    onProgress?.({ phase: 'pass1', extracted, skipped, total: total + skipCount, current: i + 1 + pass1Resumed + skipCount });
  }

  // --- Pass 2: Unified synthesis ---
  const { entries } = await readAllSignals();
  const decisionPoints = collectForSynthesis(entries);

  if (decisionPoints.length === 0) {
    debug('backfill: no decision points to synthesize');
    // Still mark sessions as processed to avoid re-scanning
    for (const entry of entries) alreadyProcessed.add(entry.session);
    await saveProcessed(alreadyProcessed);
    await clearSignals();
    return null;
  }

  debug(`backfill: Pass 2 — synthesizing ${decisionPoints.length} decision points from ${entries.length} sessions`);
  onProgress?.({ phase: 'pass2', total: total + skipCount });

  try {
    const pending = await readPending();
    const pendingTexts = getPendingRuleTexts(pending);
    const { signals, rules, insights } = await synthesizeProfile(decisionPoints, pendingTexts);

    debug(`backfill: Pass 2 done — ${signals.length} signals, ${rules.length} rules, ${insights.length} insights`);

    const profile = createDefaultProfile();
    if (signals.length > 0) await updateProfile(profile, signals);

    if (rules.length > 0) {
      await updatePending(pending, rules);
      debug(`backfill: stored ${rules.length} rules in pending`);
    }

    // Mark all sessions as fully processed and clean up
    for (const entry of entries) alreadyProcessed.add(entry.session);
    await saveProcessed(alreadyProcessed);
    await clearSignals();

    return { profile, extracted, skipped: skipped + skipCount, total: total + skipCount, insights };
  } catch (err) {
    debug(`backfill: Pass 2 FAILED — ${err.message}`);
    // Don't clear signals — Pass 1 work is preserved for retry
    return null;
  }
}
