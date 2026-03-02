import { spawn } from 'child_process';
import { debug } from './debug.js';

const DEFAULT_TIMEOUT_MS = 90_000; // 90 seconds per LLM call

/**
 * Call Claude via the `claude -p` CLI, reusing the user's existing auth.
 * Unsets CLAUDECODE env var to allow nested invocation.
 *
 * NOTE: Do NOT use --no-session-persistence — it causes empty output.
 * See: https://github.com/anthropics/claude-code/issues/7263
 */
export function complete(prompt, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.CLAUDECODE;

    debug(`llm: prompt length=${prompt.length} chars`);

    const proc = spawn('claude', ['-p', '--model', 'haiku'], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      proc.kill('SIGTERM');
      debug(`llm: killed after ${timeoutMs}ms timeout`);
    }, timeoutMs);

    proc.stdout.on('data', (d) => (stdout += d));
    proc.stderr.on('data', (d) => (stderr += d));

    proc.on('error', (err) => {
      clearTimeout(timer);
      debug(`llm: spawn error: ${err.message}`);
      if (err.code === 'ENOENT') {
        reject(new Error('claude CLI not found. Is Claude Code installed?'));
      } else {
        reject(err);
      }
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      debug(`llm: exit code=${code}, stdout=${stdout.length} chars, stderr=${stderr.length > 0 ? stderr.trim() : '(empty)'}`);
      if (killed) reject(new Error(`claude timed out after ${timeoutMs / 1000}s`));
      else if (code !== 0) reject(new Error(`claude exited with code ${code}: ${stderr.trim()}`));
      else resolve(stdout);
    });

    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}
