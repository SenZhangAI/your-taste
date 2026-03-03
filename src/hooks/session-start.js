#!/usr/bin/env node
import { readProfile } from '../profile.js';
import { renderInstructions, renderFromObservations } from '../instruction-renderer.js';
import { readObservations } from '../observations.js';
import { readTasteFile } from '../taste-file.js';
import { ensureProjectDir } from '../project.js';
import { loadGoal, renderGoalForInjection } from '../goal.js';
import { loadProjectContext, renderProjectContext } from '../context.js';
import { debug } from '../debug.js';

const QUALITY_FLOOR = 'Apply these preferences on top of professional best practices. Never compromise error handling at system boundaries, security best practices, or data integrity.';

export function buildAdditionalContext(profile, tasteContent, observationsContent, goalContent, projectContextText) {
  let base;
  if (tasteContent) {
    base = `${tasteContent}\n\n${QUALITY_FLOOR}`;
  } else {
    base = renderInstructions(profile);
  }

  const observationsRendered = renderFromObservations(observationsContent);
  const goalText = renderGoalForInjection(goalContent);

  const sections = [base, observationsRendered, goalText, projectContextText].filter(Boolean);
  if (sections.length === 0) return null;
  return sections.join('\n\n');
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  debug('session-start: hook triggered');
  const profile = await readProfile();
  const activeDims = Object.values(profile.dimensions).filter(d => d.confidence > 0.3);
  const tasteContent = await readTasteFile();
  const hasTaste = !!tasteContent;
  const observationsContent = await readObservations();
  const hasObservations = !!observationsContent;
  debug(`session-start: profile=${activeDims.length} dims, taste.md=${hasTaste}, observations=${hasObservations}`);

  // Load project-scoped data
  let goalContent = null;
  let projectContextText = null;
  try {
    const projectDir = await ensureProjectDir(process.cwd());
    debug(`session-start: project dir=${projectDir}`);
    goalContent = await loadGoal(projectDir);
    const projectCtx = await loadProjectContext(projectDir);
    projectContextText = renderProjectContext(projectCtx);
  } catch (e) {
    debug(`session-start: no project data — ${e.message}`);
  }

  const hasGoal = !!goalContent;
  const hasProjectCtx = !!projectContextText;
  debug(`session-start: goal=${hasGoal}, projectCtx=${hasProjectCtx}`);

  if (activeDims.length === 0 && !hasTaste && !hasObservations && !hasGoal && !hasProjectCtx) {
    debug('session-start: no data to inject, exiting');
    process.exit(0);
  }

  const additionalContext = buildAdditionalContext(profile, tasteContent, observationsContent, goalContent, projectContextText);

  const parts = [];
  if (hasTaste) {
    parts.push('taste.md loaded');
  } else if (activeDims.length > 0) {
    parts.push(`${activeDims.length} dimensions`);
  }
  if (hasObservations) parts.push('observations');
  if (hasGoal) parts.push('goal');
  if (hasProjectCtx) parts.push('project context');

  const output = {
    result: `your-taste: ${parts.length > 0 ? parts.join(' + ') : 'no data yet'}`,
  };

  if (additionalContext) {
    output.hookSpecificOutput = { additionalContext };
  }

  debug(`session-start: injecting context (${additionalContext?.length || 0} chars), result="${output.result}"`);
  console.log(JSON.stringify(output));
}

main().catch((e) => {
  debug(`session-start: fatal error — ${e.message}\n${e.stack}`);
  process.exit(0);
});
