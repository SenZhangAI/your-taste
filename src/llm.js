import { spawn } from 'child_process';

/**
 * Call Claude via the `claude -p` CLI, reusing the user's existing auth.
 * Unsets CLAUDECODE env var to allow nested invocation.
 */
export function complete(prompt) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.CLAUDECODE;

    const proc = spawn('claude', ['-p', '--model', 'haiku', '--no-session-persistence'], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => (stdout += d));
    proc.stderr.on('data', (d) => (stderr += d));

    proc.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error('claude CLI not found. Is Claude Code installed?'));
      } else {
        reject(err);
      }
    });

    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(`claude exited with code ${code}: ${stderr.trim()}`));
      else resolve(stdout);
    });

    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}
