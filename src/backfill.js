import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { parseTranscript, extractConversation } from './transcript.js';
import { filterSensitiveData } from './privacy.js';
import { analyzeTranscript } from './analyzer.js';
import { createDefaultProfile, updateProfile } from './profile.js';
import { debug } from './debug.js';

const DEFAULT_MAX_SESSIONS = 50;

/**
 * Convert a filesystem path to its Claude Code project directory name.
 * Claude Code uses the pattern: /Users/sen/ai/foo → -Users-sen-ai-foo
 */
function toClaudeProjectDirName(fsPath) {
  return fsPath.replace(/\//g, '-');
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
      if (!fileStat) continue;
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

  let conversation = extractConversation(messages);
  if (conversation.length < 200) {
    debug(`session: skipped (conversation ${conversation.length} chars < 200)`);
    return { signals: [] };
  }

  // Truncate very long conversations — keep the tail (recent exchanges are more signal-rich)
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
 * Orchestrate full backfill: discover sessions, analyze in batches, build profile.
 */
export async function backfill(projectsDir, options = {}) {
  const { concurrency = 3, onProgress, filter, currentProjectPath } = options;

  const sessionPaths = await discoverSessions(projectsDir, filter, currentProjectPath);
  const total = sessionPaths.length;
  debug(`backfill: discovered ${total} sessions to process (concurrency=${concurrency})`);
  let processed = 0;
  let skipped = 0;
  const allSignals = [];

  for (let i = 0; i < total; i += concurrency) {
    const batch = sessionPaths.slice(i, i + concurrency);
    const results = await Promise.allSettled(batch.map(p => processSession(p)));

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      const sessionPath = batch[j];
      if (result.status === 'fulfilled' && result.value.signals.length > 0) {
        allSignals.push(...result.value.signals);
        processed++;
      } else {
        if (result.status === 'rejected') {
          debug(`backfill: FAILED ${sessionPath} — ${result.reason?.message || result.reason}`);
        }
        skipped++;
      }
    }

    onProgress?.({ processed, skipped, total, current: Math.min(i + concurrency, total) });
  }

  if (allSignals.length === 0) return null;

  const profile = createDefaultProfile();
  await updateProfile(profile, allSignals);
  return { profile, processed, skipped, total };
}
