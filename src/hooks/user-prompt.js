#!/usr/bin/env node
import { readFile } from 'fs/promises';
import { loadGoal, renderGoalForInjection } from '../goal.js';
import { loadProjectContext, renderProjectContext } from '../context.js';
import { loadGlobalContext, renderGlobalContext } from '../global-context.js';
import { ensureProjectDir } from '../project.js';
import { debug } from '../debug.js';

const MAX_CHARS = 4000;

export async function buildUserPromptContext(projectDir) {
  // P1: Thinking framework (always included)
  let framework = '';
  try {
    framework = await readFile(
      new URL('../../prompts/thinking-framework.md', import.meta.url),
      'utf8',
    );
  } catch {
    // Template missing — degrade gracefully
  }

  // P2: Project goal
  let goalText = null;
  try {
    const goalContent = await loadGoal(projectDir);
    goalText = renderGoalForInjection(goalContent);
  } catch { /* no goal yet */ }

  // P3: Project context
  let projectCtxText = null;
  try {
    const projectCtx = await loadProjectContext(projectDir);
    projectCtxText = renderProjectContext(projectCtx);
  } catch { /* no context yet */ }

  // P4: Global context
  let globalCtxText = null;
  try {
    const globalCtx = await loadGlobalContext();
    globalCtxText = renderGlobalContext(globalCtx);
  } catch { /* no global context */ }

  // Priority-based assembly (lower number = higher priority):
  // P0: taste.md (injected by session-start, not here)
  // P1: thinking framework — core reasoning enhancement
  // P2: project goal — stable strategic context
  // P3: project context — recent tactical decisions
  // P4: global context — cross-project awareness
  const prioritized = [
    { text: framework, priority: 'P1', required: true },
    { text: goalText, priority: 'P2', required: true },
    { text: projectCtxText, priority: 'P3', required: false },
    { text: globalCtxText, priority: 'P4', required: false },
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
    process.exit(0);
  }

  debug(`user-prompt: injecting ${additionalContext.length} chars of context`);
  console.log(JSON.stringify({
    hookSpecificOutput: { additionalContext },
  }));
}

main().catch((e) => {
  debug(`user-prompt: fatal error — ${e.message}\n${e.stack}`);
  process.exit(0);
});
