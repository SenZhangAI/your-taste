import { readFile, appendFile, writeFile, unlink, mkdir } from 'fs/promises';
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
 * Collect all decision points into a flat array, sorted by strength.
 * Applies the accumulation cap to prevent Pass 2 overflow.
 */
const STRENGTH_ORDER = { rejection: 0, pushback: 1, correction: 2, active_request: 3 };
const MAX_SIGNALS_FOR_SYNTHESIS = 40;

export function collectForSynthesis(entries) {
  const all = [];
  for (const entry of entries) {
    for (const dp of entry.decision_points) {
      all.push(dp);
    }
  }

  // Sort by strength (strongest first)
  all.sort((a, b) => (STRENGTH_ORDER[a.strength] ?? 9) - (STRENGTH_ORDER[b.strength] ?? 9));

  if (all.length > MAX_SIGNALS_FOR_SYNTHESIS) {
    debug(`signals: capping ${all.length} → ${MAX_SIGNALS_FOR_SYNTHESIS} for synthesis`);
    return all.slice(0, MAX_SIGNALS_FOR_SYNTHESIS);
  }
  return all;
}

/**
 * Clear the intermediate signals file after successful Pass 2.
 */
export async function clearSignals() {
  try {
    await unlink(getSignalsPath());
    debug('signals: cleared init-signals.jsonl');
  } catch {
    // already gone
  }
}
