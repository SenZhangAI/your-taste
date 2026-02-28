import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { parseTranscript, extractConversation } from './transcript.js';
import { filterSensitiveData } from './privacy.js';
import { analyzeTranscript } from './analyzer.js';
import { createDefaultProfile, updateProfile } from './profile.js';

const DEFAULT_MAX_SESSIONS = 50;

/**
 * Scan projectsDir for JSONL session transcript files.
 * Returns paths sorted by mtime (most recent first), filtered by options.
 *
 * @param {string} projectsDir
 * @param {object} [filter]
 * @param {number} [filter.maxSessions] - Cap on number of sessions to return
 * @param {number} [filter.days] - Only include sessions modified within this many days
 * @param {boolean} [filter.all] - Ignore limits, return everything
 */
export async function discoverSessions(projectsDir, filter = {}) {
  let projectDirs;
  try {
    projectDirs = await readdir(projectsDir);
  } catch {
    return [];
  }

  const sessions = [];

  for (const projectName of projectDirs) {
    const projectPath = join(projectsDir, projectName);
    const info = await stat(projectPath).catch(() => null);
    if (!info?.isDirectory()) continue;

    const entries = await readdir(projectPath);
    for (const entry of entries) {
      if (!entry.endsWith('.jsonl')) continue;
      const fullPath = join(projectPath, entry);
      const fileStat = await stat(fullPath).catch(() => null);
      if (!fileStat) continue;
      sessions.push({ path: fullPath, mtime: fileStat.mtimeMs });
    }
  }

  // Sort by most recent first
  sessions.sort((a, b) => b.mtime - a.mtime);

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

  return filtered.map(s => s.path);
}

/**
 * Process a single session transcript through the analysis pipeline.
 * Returns { signals, context } or { signals: [] } if the session is too short.
 */
export async function processSession(transcriptPath) {
  const messages = await parseTranscript(transcriptPath);
  if (messages.length < 4) return { signals: [] };

  const conversation = extractConversation(messages);
  if (conversation.length < 200) return { signals: [] };

  const filtered = filterSensitiveData(conversation);
  const { signals, context } = await analyzeTranscript(filtered);
  return { signals, context };
}

/**
 * Orchestrate full backfill: discover sessions, analyze in batches, build profile.
 */
export async function backfill(projectsDir, options = {}) {
  const { concurrency = 3, onProgress, filter } = options;

  const sessionPaths = await discoverSessions(projectsDir, filter);
  const total = sessionPaths.length;
  let processed = 0;
  let skipped = 0;
  const allSignals = [];

  for (let i = 0; i < total; i += concurrency) {
    const batch = sessionPaths.slice(i, i + concurrency);
    const results = await Promise.allSettled(batch.map(p => processSession(p)));

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.signals.length > 0) {
        allSignals.push(...result.value.signals);
        processed++;
      } else {
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
