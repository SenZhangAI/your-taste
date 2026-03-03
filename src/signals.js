import { readFile, appendFile, writeFile, unlink, rename, mkdir } from 'fs/promises';
import { debug } from './debug.js';

function getDir() {
  return process.env.YOUR_TASTE_DIR || `${process.env.HOME}/.your-taste`;
}

function getSignalsPath() {
  return `${getDir()}/init-signals.jsonl`;
}

/**
 * Append one session's extracted decision points to the intermediate signals file.
 * Each line = JSON object with sessionPath + decision points.
 */
export async function appendSignals(sessionPath, decisionPoints, context = null) {
  const dir = getDir();
  await mkdir(dir, { recursive: true });
  const entry = JSON.stringify({ session: sessionPath, decision_points: decisionPoints, context });
  await appendFile(getSignalsPath(), entry + '\n', 'utf8');
  debug(`signals: appended ${decisionPoints.length} decision points from ${sessionPath}`);
}

/**
 * Read all accumulated signals from the intermediate file.
 * Returns { entries: [{session, decision_points, context}], sessions: Set<path> }.
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
 * Collect all decision points into a flat array, filter low-quality entries,
 * sort by strength, and cap to prevent Pass 2 prompt overflow.
 */
const STRENGTH_ORDER = { rejection: 0, pushback: 1, correction: 2, active_request: 3 };
const MAX_SIGNALS_FOR_SYNTHESIS = 25;
const MIN_PRINCIPLE_LENGTH = 15;

export function collectForSynthesis(entries) {
  const all = [];
  for (const entry of entries) {
    for (const dp of entry.decision_points) {
      all.push(dp);
    }
  }

  // Quality filter: drop decision points with vague/too-short principles
  const before = all.length;
  const filtered = all.filter(dp => dp.principle && dp.principle.length >= MIN_PRINCIPLE_LENGTH);
  if (filtered.length < before) {
    debug(`signals: filtered ${before - filtered.length} low-quality DPs (principle < ${MIN_PRINCIPLE_LENGTH} chars)`);
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
    // Filter out empty entries (processed but yielded no decision points)
    const meaningful = content.split('\n').filter(line => {
      if (!line.trim()) return false;
      try { return JSON.parse(line).decision_points?.length > 0; }
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
