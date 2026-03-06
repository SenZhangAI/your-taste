import { readdir, stat, readFile, writeFile, mkdir } from 'fs/promises';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { join, dirname } from 'path';
import { parseTranscript, extractConversation } from './transcript.js';
import { filterSensitiveData } from './privacy.js';
import { extractSignals, synthesizeProfile } from './analyzer.js';
import { readObservations, writeObservations, extractSuggestedRules } from './observations.js';
import { appendSignals, readAllSignals, collectForSynthesis, clearSignals } from './signals.js';
import { readManagedRules } from './claudemd.js';
import { appendProposal } from './proposals.js';
import { hasLangFile, writeLang } from './lang.js';
import { META_MARKER, loadConfig } from './llm.js';
import { debug } from './debug.js';

const DEFAULT_MAX_SESSIONS = 50;
const MAX_CONSECUTIVE_FAILURES = 3;
const PROCESSED_PATH = `${process.env.HOME}/.your-taste/processed.json`;

function isTimeoutError(err) {
  return /timed? ?out|timeout|504/i.test(err.message);
}

function isRateLimitError(err) {
  return /\b429\b/.test(err.message);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Sessions smaller than this are almost always junk (session starts without real interaction).
// Viable sessions are typically 14KB+; junk (too few messages, too short) median 5-7KB.
const MIN_FILE_SIZE = 10_000;

// Signatures to detect meta-sessions (taste init's own claude -p calls, skill invocations,
// and automated agent sessions that don't contain real user decision-making).
// Checked against the first 2KB of each file — cheap O(1) read, no full parse needed.
const META_SESSION_MARKERS = [
  META_MARKER,                        // explicit marker prepended to all LLM prompts
  'You are a session analyst',        // legacy: old extract prompt
  'You are a JSON-only',             // legacy: old signal extractor prompt
  'your-taste/skills/',              // skill invocation (file path in content)
  'you are continuing to observe',   // claude-mem observer agent
  'You are a Claude-Mem',            // claude-mem observer agent (alternate start)
  'claude-mem-observer',             // claude-mem project directory in path
];

/**
 * Convert a filesystem path to its Claude Code project directory name.
 * Claude Code uses the pattern: /Users/sen/ai/foo → -Users-sen-ai-foo
 */
function toClaudeProjectDirName(fsPath) {
  return fsPath.replace(/\//g, '-');
}

/**
 * Check if a session file is a meta-session (from taste init's own claude -p calls
 * or skill invocations). Scans the first few user/assistant messages for markers.
 *
 * JSONL files start with metadata lines (progress, hook events), so raw byte reads
 * miss the actual content. Instead we parse lines until we find enough content.
 */
async function isMetaSession(filePath) {
  const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
  let contentChecked = 0;
  let totalLines = 0;
  const MAX_CONTENT_LINES = 5; // check first 5 content messages
  const MAX_TOTAL_LINES = 50;  // give up scanning after this many JSONL lines

  try {
    for await (const line of rl) {
      if (!line.trim()) continue;
      let parsed;
      try { parsed = JSON.parse(line); } catch { continue; }

      totalLines++;
      if (totalLines >= MAX_TOTAL_LINES) break;

      // Only check user/assistant message lines with text content
      const type = parsed.type;
      if (type !== 'user' && type !== 'assistant') continue;

      const content = parsed.message?.content ?? parsed.content;
      const text = typeof content === 'string' ? content
        : Array.isArray(content) ? content.filter(b => b.type === 'text').map(b => b.text).join(' ')
        : null;
      if (!text) continue;

      if (META_SESSION_MARKERS.some(marker => text.includes(marker))) {
        rl.close();
        return true;
      }

      contentChecked++;
      if (contentChecked >= MAX_CONTENT_LINES) break;
    }
  } catch { /* read error — not meta */ }

  rl.close();

  // No user/assistant messages found → not a real session (e.g., queue-operation files)
  if (contentChecked === 0) return true;

  return false;
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
    // Skip project directories that are known automated/agent sessions
    if (META_SESSION_MARKERS.some(m => projectName.includes(m))) {
      debug(`discover: skipping automated project "${projectName}"`);
      continue;
    }

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

    // Apply max sessions cap (default 50) — skipped when noCap is set,
    // allowing callers to apply the cap after their own filtering (e.g. processed sessions).
    if (!filter.noCap) {
      const max = filter.maxSessions || DEFAULT_MAX_SESSIONS;
      filtered = filtered.slice(0, max);
    }
  }

  const currentCount = filtered.filter(s => s.isCurrentProject).length;
  if (currentDirName && currentCount > 0) {
    debug(`discover: ${currentCount} sessions from current project prioritized`);
  }

  return filtered.map(s => ({ path: s.path, mtime: s.mtime }));
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
 * Prepare a session transcript for analysis.
 * Returns filtered conversation text, or null if the session should be skipped.
 */
export function prepareConversation(messages) {
  if (messages.length < 4) return null;

  let conversation = extractConversation(messages, { compact: true });
  if (conversation.length < 200) return null;

  if (conversation.length > MAX_CONVERSATION_CHARS) {
    conversation = '...(earlier conversation truncated)...\n\n' + conversation.slice(-MAX_CONVERSATION_CHARS);
  }

  return filterSensitiveData(conversation);
}

/**
 * Pass 1: Extract reasoning gaps from a single session.
 * Returns { reasoningGaps, context } or null if session is not viable.
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
  const { reasoningGaps, context, userLanguage } = await extractSignals(conversation);
  debug(`pass1: done — ${reasoningGaps.length} reasoning gaps${userLanguage ? `, lang=${userLanguage}` : ''}`);
  return { reasoningGaps, context, userLanguage };
}

/**
 * Orchestrate full backfill with two-pass architecture.
 *
 * Pass 1: Per-session signal extraction → persisted to init-signals.jsonl
 *         Interruption-safe: resumes from where it left off.
 * Pass 2: Unified synthesis from all accumulated decision points → observations.md
 *
 * Sequential processing — each `claude -p` subprocess is heavy.
 * Fail-fast: aborts Pass 1 after MAX_CONSECUTIVE_FAILURES consecutive LLM failures.
 */
export async function backfill(projectsDir, options = {}) {
  const { onProgress, onPreview, filter, currentProjectPath, model: overrideModel } = options;

  // Discover all candidates (noCap) so the session cap applies AFTER filtering out
  // already-processed sessions. Without this, repeated runs stall: the same N newest
  // sessions are discovered every time, all already processed, leaving older unprocessed
  // sessions permanently unreachable.
  const discovered = await discoverSessions(projectsDir, { ...filter, noCap: true }, currentProjectPath);

  // Skip fully-processed sessions, then apply the per-run cap
  const alreadyProcessed = await loadProcessed();
  const maxSessions = filter?.all ? discovered.length : (filter?.maxSessions || DEFAULT_MAX_SESSIONS);
  const toProcess = discovered.filter(s => !alreadyProcessed.has(s.path)).slice(0, maxSessions);
  const skipCount = discovered.length - toProcess.length;
  if (skipCount > 0) debug(`backfill: skipping ${skipCount} fully-processed sessions`);

  // Check which sessions already completed Pass 1 (from an interrupted previous run)
  const { sessions: pass1Done } = await readAllSignals();
  const needPass1 = toProcess.filter(s => !pass1Done.has(s.path));
  const pass1Resumed = toProcess.length - needPass1.length;
  if (pass1Resumed > 0) debug(`backfill: resuming — ${pass1Resumed} sessions already have Pass 1 results`);

  const total = toProcess.length;
  debug(`backfill: ${needPass1.length} sessions need Pass 1, ${total} total for synthesis`);

  // Preview: report what will be processed before starting heavy work
  if (onPreview && toProcess.length > 0) {
    const mtimes = toProcess.map(s => s.mtime);
    onPreview({
      toProcess: toProcess.length,
      skipped: skipCount,
      needPass1: needPass1.length,
      resumed: pass1Resumed,
      oldest: new Date(Math.min(...mtimes)),
      newest: new Date(Math.max(...mtimes)),
    });
  }

  // Extract paths for processing
  const toProcessPaths = toProcess.map(s => s.path);
  const needPass1Paths = needPass1.map(s => s.path);

  // --- Pass 1: Extract decision points per session ---
  let extracted = pass1Resumed;
  let skipped = 0;
  let recentFailures = 0;  // failures in the most recent batch
  let langDetected = false;
  let aborted = false;

  const concurrency = options.concurrency || 1;
  debug(`backfill: concurrency = ${concurrency}`);

  // Serialize appendSignals calls to prevent interleaved writes
  let writeChain = Promise.resolve();
  function safeAppend(sessionPath, gaps, context) {
    writeChain = writeChain.then(() => appendSignals(sessionPath, gaps, context));
    return writeChain;
  }

  const RATE_LIMIT_BACKOFF_MS = 10_000;
  const MAX_RATE_LIMIT_RETRIES = 3;

  for (let batchStart = 0; batchStart < needPass1Paths.length && !aborted; batchStart += concurrency) {
    const batch = needPass1Paths.slice(batchStart, batchStart + concurrency);

    // Process batch, collecting rate-limited sessions for retry
    let toRun = batch.map(sessionPath => ({ sessionPath, retries: 0 }));

    while (toRun.length > 0) {
      const results = await Promise.allSettled(toRun.map(async ({ sessionPath }) => {
        const result = await pass1Session(sessionPath);
        return { sessionPath, result };
      }));

      const retryQueue = [];

      for (let j = 0; j < results.length; j++) {
        const settled = results[j];
        const { retries } = toRun[j];

        if (settled.status === 'fulfilled') {
          const { sessionPath, result } = settled.value;
          if (result && result.reasoningGaps.length > 0) {
            await safeAppend(sessionPath, result.reasoningGaps, result.context);
            extracted++;
          } else {
            await safeAppend(sessionPath, [], result?.context || null);
            skipped++;
          }

          if (!langDetected && result?.userLanguage) {
            langDetected = true;
            if (!(await hasLangFile())) {
              await writeLang(result.userLanguage);
              debug(`backfill: auto-detected language "${result.userLanguage}"`);
            }
          }

          recentFailures = 0;
        } else if (isRateLimitError(settled.reason) && retries < MAX_RATE_LIMIT_RETRIES) {
          debug(`pass1: rate-limited, will retry (attempt ${retries + 1}/${MAX_RATE_LIMIT_RETRIES})`);
          retryQueue.push({ sessionPath: toRun[j].sessionPath, retries: retries + 1 });
        } else {
          debug(`pass1: FAILED — ${settled.reason?.message}`);
          skipped++;
          recentFailures++;
        }
      }

      if (retryQueue.length > 0) {
        debug(`backfill: waiting ${RATE_LIMIT_BACKOFF_MS / 1000}s before retrying ${retryQueue.length} rate-limited sessions`);
        await sleep(RATE_LIMIT_BACKOFF_MS);
      }

      toRun = retryQueue;
    }

    if (recentFailures >= MAX_CONSECUTIVE_FAILURES) {
      debug(`backfill: aborting Pass 1 — ${MAX_CONSECUTIVE_FAILURES} consecutive failures`);
      const current = Math.min(batchStart + batch.length, needPass1Paths.length);
      onProgress?.({ phase: 'pass1', extracted, skipped, total: total + skipCount, current: current + pass1Resumed + skipCount, aborted: true });
      if (extracted === 0) {
        throw new Error('All sessions failed');
      }
      aborted = true;
      break;
    }

    const current = Math.min(batchStart + batch.length, needPass1Paths.length);
    onProgress?.({ phase: 'pass1', extracted, skipped, total: total + skipCount, current: current + pass1Resumed + skipCount });
  }

  // --- Pass 2: Unified synthesis → observations.md ---
  const { entries } = await readAllSignals();
  const reasoningGaps = collectForSynthesis(entries);

  if (reasoningGaps.length === 0) {
    debug('backfill: no reasoning gaps to synthesize');
    for (const entry of entries) alreadyProcessed.add(entry.session);
    await saveProcessed(alreadyProcessed);
    await clearSignals();
    return null;
  }

  onProgress?.({ phase: 'pass2', total: total + skipCount });

  const existingObservations = await readObservations();
  const claudeMdPath = `${process.env.HOME}/.claude/CLAUDE.md`;
  const tasteRules = await readManagedRules(claudeMdPath);

  // Resolve synthesis model: CLI override > config.synthesisModel > default
  const config = await loadConfig();
  const synthesisModel = overrideModel || config?.synthesisModel || null;
  if (synthesisModel) debug(`backfill: using synthesis model override: ${synthesisModel}`);

  // Retry with fewer decision points on timeout — strongest signals are sorted first,
  // so halving always preserves the highest-value data.
  const MIN_GAPS_FOR_RETRY = 5;
  let gapsToUse = reasoningGaps;
  let observationsMarkdown = null;

  while (gapsToUse.length >= MIN_GAPS_FOR_RETRY) {
    debug(`backfill: Pass 2 — synthesizing ${gapsToUse.length} reasoning gaps from ${entries.length} sessions`);
    try {
      observationsMarkdown = await synthesizeProfile(gapsToUse, existingObservations, tasteRules, synthesisModel);
      break;
    } catch (err) {
      if (!isTimeoutError(err) || gapsToUse.length <= MIN_GAPS_FOR_RETRY) {
        debug(`backfill: Pass 2 FAILED — ${err.message}`);
        return null;
      }
      const reduced = Math.max(MIN_GAPS_FOR_RETRY, Math.floor(gapsToUse.length / 2));
      debug(`backfill: Pass 2 timed out with ${gapsToUse.length} gaps, retrying with ${reduced}`);
      onProgress?.({ phase: 'pass2', total: total + skipCount, retrying: reduced });
      gapsToUse = reasoningGaps.slice(0, reduced);
    }
  }

  let proposalCount = 0;
  if (observationsMarkdown) {
    await writeObservations(observationsMarkdown);
    debug(`backfill: wrote observations.md (${observationsMarkdown.length} chars)`);

    // Extract suggested rules from observations → proposals.jsonl
    const suggestedRules = extractSuggestedRules(observationsMarkdown);
    for (const rule of suggestedRules) {
      await appendProposal({
        rule,
        evidence: 'Synthesized from multiple sessions via taste:init',
        source: 'taste:init',
        scope: 'global',
      });
    }
    proposalCount = suggestedRules.length;
    if (proposalCount > 0) {
      debug(`backfill: ${proposalCount} suggested rules added to proposals`);
    }
  }

  // Mark all sessions as fully processed and clean up
  for (const entry of entries) alreadyProcessed.add(entry.session);
  await saveProcessed(alreadyProcessed);
  await clearSignals();

  return { observations: observationsMarkdown, extracted, skipped: skipped + skipCount, total: total + skipCount, proposalCount };
}
