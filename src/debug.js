import { existsSync, appendFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const FLAG_PATH = `${process.env.HOME}/.your-taste/.debug`;
const LOG_PATH = `${process.env.HOME}/.your-taste/debug.log`;

function isEnabled() {
  return !!(process.env.YOUR_TASTE_DEBUG || process.env.__YOUR_TASTE_DEBUG_INTERNAL || existsSync(FLAG_PATH));
}

// Cache per process — checked once on first debug() call
let _cached = null;

/**
 * Log debug message to ~/.your-taste/debug.log (safe for hooks).
 * CLI --debug also mirrors to stderr for immediate visibility.
 *
 * Enabled by any of:
 *   - YOUR_TASTE_DEBUG=1 env var
 *   - --debug CLI flag
 *   - taste debug on (writes ~/.your-taste/.debug flag file)
 */
export function debug(...args) {
  if (_cached === null) _cached = isEnabled();
  if (!_cached) return;
  const timestamp = new Date().toISOString().slice(11, 23);
  const line = `[taste ${timestamp}] ${args.map(a => typeof a === 'string' ? a : JSON.stringify(a, null, 2)).join(' ')}\n`;

  // Always append to log file
  try {
    mkdirSync(dirname(LOG_PATH), { recursive: true });
    appendFileSync(LOG_PATH, line);
  } catch {
    // Can't write log — degrade silently
  }

  // CLI --debug also writes to stderr for immediate feedback
  if (process.env.__YOUR_TASTE_DEBUG_INTERNAL) {
    process.stderr.write(line);
  }
}

export function isDebug() {
  if (_cached === null) _cached = isEnabled();
  return _cached;
}

export { FLAG_PATH, LOG_PATH };
