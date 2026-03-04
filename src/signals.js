import { readFile, appendFile, writeFile, unlink, rename, mkdir } from 'fs/promises';
import { debug } from './debug.js';

function getDir() {
  return process.env.YOUR_TASTE_DIR || `${process.env.HOME}/.your-taste`;
}

function getSignalsPath() {
  return `${getDir()}/init-signals.jsonl`;
}

/**
 * Append one session's extracted reasoning gaps to the intermediate signals file.
 * Each line = JSON object with sessionPath + reasoning gaps.
 */
export async function appendSignals(sessionPath, reasoningGaps, context = null) {
  const dir = getDir();
  await mkdir(dir, { recursive: true });
  const entry = JSON.stringify({ session: sessionPath, reasoning_gaps: reasoningGaps, context });
  await appendFile(getSignalsPath(), entry + '\n', 'utf8');
  debug(`signals: appended ${reasoningGaps.length} reasoning gaps from ${sessionPath}`);
}

/**
 * Read all accumulated signals from the intermediate file.
 * Returns { entries: [{session, reasoning_gaps, context}], sessions: Set<path> }.
 */
export async function readAllSignals() {
  const entries = [];
  const sessions = new Set();

  try {
    const content = await readFile(getSignalsPath(), 'utf8');
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        entries.push(entry);
        sessions.add(entry.session);
      } catch {
        // skip malformed lines
      }
    }
  } catch {
    // file doesn't exist yet — that's fine
  }

  return { entries, sessions };
}

/**
 * Collect all reasoning gaps into a flat array, filter low-quality entries,
 * sort by strength, and cap to prevent Stage 2 prompt overflow.
 * Supports legacy decision_points format for backward compat.
 */
const STRENGTH_ORDER = { rejection: 0, pushback: 1, correction: 2, active_request: 3 };
const MAX_SIGNALS_FOR_SYNTHESIS = 25;
const MIN_CHECKPOINT_LENGTH = 15;

export function collectForSynthesis(entries) {
  const all = [];
  for (const entry of entries) {
    for (const g of (entry.reasoning_gaps || entry.decision_points || [])) {
      all.push(g);
    }
  }

  // Quality filter: drop gaps with vague/too-short checkpoints (or legacy principles)
  const before = all.length;
  const filtered = all.filter(g => {
    const text = g.checkpoint || g.principle || '';
    return text.length >= MIN_CHECKPOINT_LENGTH;
  });
  if (filtered.length < before) {
    debug(`signals: filtered ${before - filtered.length} low-quality gaps (checkpoint < ${MIN_CHECKPOINT_LENGTH} chars)`);
  }

  // Sort by strength (strongest first)
  filtered.sort((a, b) => (STRENGTH_ORDER[a.strength] ?? 9) - (STRENGTH_ORDER[b.strength] ?? 9));

  if (filtered.length > MAX_SIGNALS_FOR_SYNTHESIS) {
    debug(`signals: capping ${filtered.length} → ${MAX_SIGNALS_FOR_SYNTHESIS} for synthesis`);
    return filtered.slice(0, MAX_SIGNALS_FOR_SYNTHESIS);
  }
  return filtered;
}

/**
 * Archive the signals file after successful Pass 2.
 * Moves to history/init-signals-{timestamp}.jsonl for future reference.
 */
export async function clearSignals() {
  const src = getSignalsPath();
  try {
    const content = await readFile(src, 'utf8');
    // Filter out empty entries (processed but yielded no reasoning gaps)
    const meaningful = content.split('\n').filter(line => {
      if (!line.trim()) return false;
      try {
        const parsed = JSON.parse(line);
        return (parsed.reasoning_gaps?.length > 0) || (parsed.decision_points?.length > 0);
      }
      catch { return false; }
    });

    if (meaningful.length > 0) {
      const historyDir = `${getDir()}/history`;
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const dest = `${historyDir}/init-signals-${ts}.jsonl`;
      await mkdir(historyDir, { recursive: true });
      await writeFile(dest, meaningful.join('\n') + '\n', 'utf8');
      debug(`signals: archived ${meaningful.length} entries → ${dest}`);
    }

    await unlink(src);
  } catch {
    // already gone
  }
}
