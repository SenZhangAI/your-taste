#!/usr/bin/env node
import { renderFromObservations } from '../instruction-renderer.js';
import { readObservations } from '../observations.js';
import { ensureProjectDir } from '../project.js';
import { loadProjectContext, renderProjectContext } from '../context.js';
import { readProposals } from '../proposals.js';
import { debug } from '../debug.js';

const QUALITY_FLOOR = 'Apply these preferences on top of professional best practices. Never compromise error handling at system boundaries, security best practices, or data integrity.';

export function buildAdditionalContext(observationsContent, projectContextText) {
  const sections = [];

  const observationsRendered = renderFromObservations(observationsContent);
  if (observationsRendered) sections.push(observationsRendered);

  sections.push(QUALITY_FLOOR);

  if (projectContextText) sections.push(projectContextText);

  return sections.length > 1 ? sections.join('\n\n') : null;
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  debug('session-start: hook triggered');
  const observationsContent = await readObservations();
  const hasObservations = !!observationsContent;

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
  debug(`session-start: observations=${hasObservations}, projectCtx=${hasProjectCtx}, proposals=${proposals.length}`);

  if (!hasObservations && !hasProjectCtx && !hasProposals) {
    debug('session-start: no data to inject, exiting');
    console.log(JSON.stringify({ result: 'your-taste: no data yet' }));
    process.exit(0);
  }

  const additionalContext = buildAdditionalContext(observationsContent, projectContextText);

  const parts = [];
  if (hasObservations) parts.push('observations');
  if (hasProjectCtx) parts.push('project context');

  let resultMsg = `your-taste: ${parts.length > 0 ? parts.join(' + ') : 'no data yet'}`;
  if (hasProposals) {
    resultMsg += ` | ${proposals.length} new rule proposal${proposals.length > 1 ? 's' : ''}, run \`taste review\` to review`;
  }

  const output = { result: resultMsg };
  if (additionalContext) {
    output.hookSpecificOutput = { additionalContext };
  }

  debug(`session-start: injecting context (${additionalContext?.length || 0} chars), result="${output.result}"`);
  console.log(JSON.stringify(output));
}

main().catch((e) => {
  debug(`session-start: fatal error — ${e.message}\n${e.stack}`);
  console.log(JSON.stringify({ result: `your-taste: startup error — ${e.message}` }));
  process.exit(0);
});
