import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { parseTranscript, extractConversation } from './transcript.js';
import { filterSensitiveData } from './privacy.js';
import { analyzeTranscript } from './analyzer.js';
import { createDefaultProfile, updateProfile } from './profile.js';

/**
 * Scan projectsDir for JSONL session transcript files.
 * Returns full paths to all .jsonl files that are direct children of project subdirs,
 * skipping any inside subagents/ directories.
 */
export async function discoverSessions(projectsDir) {
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
      sessions.push(join(projectPath, entry));
    }
  }

  return sessions;
}

/**
 * Process a single session transcript through the analysis pipeline.
 * Returns extracted signals, or empty array if the session is too short.
 */
export async function processSession(transcriptPath) {
  const messages = await parseTranscript(transcriptPath);
  if (messages.length < 4) return [];

  const conversation = extractConversation(messages);
  if (conversation.length < 200) return [];

  const filtered = filterSensitiveData(conversation);
  return analyzeTranscript(filtered);
}

/**
 * Orchestrate full backfill: discover sessions, analyze in batches, build profile.
 */
export async function backfill(projectsDir, options = {}) {
  const { concurrency = 3, onProgress } = options;

  const sessionPaths = await discoverSessions(projectsDir);
  const total = sessionPaths.length;
  let processed = 0;
  let skipped = 0;
  const allSignals = [];

  for (let i = 0; i < total; i += concurrency) {
    const batch = sessionPaths.slice(i, i + concurrency);
    const results = await Promise.allSettled(batch.map(p => processSession(p)));

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.length > 0) {
        allSignals.push(...result.value);
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
