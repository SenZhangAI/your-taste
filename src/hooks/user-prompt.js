#!/usr/bin/env node
import { readFile } from 'fs/promises';
import { loadProjectContext, renderProjectContext } from '../context.js';
import { loadGlobalContext, renderGlobalContext } from '../global-context.js';
import { ensureProjectDir } from '../project.js';
import { debug } from '../debug.js';

const MAX_CHARS = 4000;

function getThinkingContextPath() {
  const dir = process.env.YOUR_TASTE_DIR || `${process.env.HOME}/.your-taste`;
  return `${dir}/thinking-context.md`;
}

export async function buildUserPromptContext(projectDir) {
  // P1: Thinking context (evolved) or base thinking framework (cold start)
  let framework = '';

  // Try evolved thinking-context.md first
  try {
    framework = await readFile(getThinkingContextPath(), 'utf8');
    debug('user-prompt: using thinking-context.md');
  } catch { /* not yet synthesized */ }

  // Fall back to base thinking framework
  if (!framework) {
    try {
      framework = await readFile(
        new URL('../../prompts/base-thinking.md', import.meta.url),
        'utf8',
      );
      debug('user-prompt: falling back to base-thinking.md');
    } catch {
      // Template missing — degrade gracefully
    }
  }

  // P2: Project context
  let projectCtxText = null;
  try {
    const projectCtx = await loadProjectContext(projectDir);
    projectCtxText = renderProjectContext(projectCtx);
  } catch { /* no context yet */ }

  // P3: Global context
  let globalCtxText = null;
  try {
    const globalCtx = await loadGlobalContext();
    globalCtxText = await renderGlobalContext(globalCtx);
  } catch { /* no global context */ }

  // Priority-based assembly (lower number = higher priority):
  // P1: thinking-context.md (evolved) or base-thinking.md (cold start) — core reasoning enhancement
  // P2: project context — recent tactical decisions
  // P3: global context — cross-project awareness
  const prioritized = [
    { text: framework, priority: 'P1', required: true },
    { text: projectCtxText, priority: 'P2', required: false },
    { text: globalCtxText, priority: 'P3', required: false },
  ].filter(s => s.text);

  if (prioritized.length === 0) return null;

  // Add sections until budget exceeded, then stop
  const sections = [];
  let totalLen = 0;

  for (const s of prioritized) {
    if (totalLen + s.text.length > MAX_CHARS && !s.required) break;
    sections.push(s.text);
    totalLen += s.text.length;
  }

  return sections.join('\n\n') || null;
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  let projectDir;
  try {
    projectDir = await ensureProjectDir(process.cwd());
  } catch {
    projectDir = null;
  }

  const additionalContext = await buildUserPromptContext(projectDir);
  if (!additionalContext) {
    debug('user-prompt: no context to inject');
    console.log(JSON.stringify({ result: 'your-taste: no context' }));
    process.exit(0);
  }

  debug(`user-prompt: injecting ${additionalContext.length} chars of context`);
  console.log(JSON.stringify({
    result: 'your-taste: context injected',
    hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext },
  }));
}

main().catch((e) => {
  debug(`user-prompt: fatal error — ${e.message}\n${e.stack}`);
  const isInfra = /timeout|ECONNREFUSED|ECONNRESET|API error [5]\d{2}/i.test(e.message);
  if (isInfra) {
    process.exit(0);
  }
  console.log(JSON.stringify({ result: `your-taste: prompt error — ${e.message}` }));
  process.exit(2);
});
