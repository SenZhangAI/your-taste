#!/usr/bin/env node
import { stat } from 'fs/promises';
import { readObservations } from '../observations.js';
import { ensureProjectDir } from '../project.js';
import { loadProjectContext, renderProjectContext } from '../context.js';
import { readProposals } from '../proposals.js';
import { synthesizeThinkingContext } from '../synthesize-thinking.js';
import { debug } from '../debug.js';

function getThinkingContextPath() {
  const dir = process.env.YOUR_TASTE_DIR || `${process.env.HOME}/.your-taste`;
  return `${dir}/thinking-context.md`;
}

function getObservationsPath() {
  const dir = process.env.YOUR_TASTE_DIR || `${process.env.HOME}/.your-taste`;
  return `${dir}/observations.md`;
}

async function getMtime(path) {
  try {
    const s = await stat(path);
    return s.mtimeMs;
  } catch {
    return 0;
  }
}

async function maybeResynthesize() {
  const obsMtime = await getMtime(getObservationsPath());
  const ctxMtime = await getMtime(getThinkingContextPath());

  if (obsMtime === 0) {
    debug('session-start: no observations yet, skipping synthesis');
    return false;
  }

  if (ctxMtime > 0 && obsMtime <= ctxMtime) {
    debug('session-start: thinking-context.md is up to date');
    return false;
  }

  debug(`session-start: observations newer than thinking-context (${obsMtime} > ${ctxMtime}), triggering Stage 3`);
  try {
    await synthesizeThinkingContext();
    debug('session-start: Stage 3 synthesis complete');
    return true;
  } catch (e) {
    debug(`session-start: Stage 3 failed — ${e.message}`);
    return false;
  }
}

export function buildAdditionalContext(projectContextText) {
  if (!projectContextText) return null;
  return projectContextText;
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  debug('session-start: hook triggered');

  // Stage 3: re-synthesize thinking-context.md if observations changed
  const resynthesized = await maybeResynthesize();

  // Load project-scoped data
  let projectContextText = null;
  try {
    const projectDir = await ensureProjectDir(process.cwd());
    debug(`session-start: project dir=${projectDir}`);
    const projectCtx = await loadProjectContext(projectDir);
    projectContextText = renderProjectContext(projectCtx);
  } catch (e) {
    debug(`session-start: no project data — ${e.message}`);
  }

  // Check for pending proposals
  const proposals = await readProposals();
  const hasProposals = proposals.length > 0;

  const hasProjectCtx = !!projectContextText;
  debug(`session-start: projectCtx=${hasProjectCtx}, proposals=${proposals.length}, resynthesized=${resynthesized}`);

  if (!hasProjectCtx && !hasProposals && !resynthesized) {
    debug('session-start: no data to inject, exiting');
    console.log(JSON.stringify({ result: 'your-taste: no data yet' }));
    process.exit(0);
  }

  const additionalContext = buildAdditionalContext(projectContextText);

  const parts = [];
  if (resynthesized) parts.push('thinking-context updated');
  if (hasProjectCtx) parts.push('project context');

  let resultMsg = `your-taste: ${parts.length > 0 ? parts.join(' + ') : 'ready'}`;
  if (hasProposals) {
    resultMsg += ` | ${proposals.length} new rule proposal${proposals.length > 1 ? 's' : ''}, run \`taste review\` to review`;
  }

  const output = { result: resultMsg };
  if (additionalContext) {
    output.hookSpecificOutput = { hookEventName: 'SessionStart', additionalContext };
  }

  debug(`session-start: injecting context (${additionalContext?.length || 0} chars), result="${output.result}"`);
  console.log(JSON.stringify(output));
}

main().catch((e) => {
  debug(`session-start: fatal error — ${e.message}\n${e.stack}`);
  const isInfra = /timeout|ECONNREFUSED|ECONNRESET|API error [5]\d{2}/i.test(e.message);
  if (isInfra) {
    process.exit(0);
  }
  console.log(JSON.stringify({ result: `your-taste: startup error — ${e.message}` }));
  process.exit(2);
});
