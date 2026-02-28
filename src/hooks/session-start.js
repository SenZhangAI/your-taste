#!/usr/bin/env node
import { readProfile } from '../profile.js';
import { renderInstructions } from '../instruction-renderer.js';
import { readTasteFile } from '../taste-file.js';
import { ensureProjectDir } from '../project.js';
import { loadGoal, renderGoalForInjection } from '../goal.js';
import { loadProjectContext, renderProjectContext } from '../context.js';

const QUALITY_FLOOR = 'Apply these preferences on top of professional best practices. Never compromise error handling at system boundaries, security best practices, or data integrity.';

export function buildAdditionalContext(profile, tasteContent, goalContent, projectContextText) {
  let base;
  if (tasteContent) {
    base = `${tasteContent}\n\n${QUALITY_FLOOR}`;
  } else {
    base = renderInstructions(profile);
  }

  const goalText = renderGoalForInjection(goalContent);

  const sections = [base, goalText, projectContextText].filter(Boolean);
  if (sections.length === 0) return null;
  return sections.join('\n\n');
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  const profile = await readProfile();
  const activeDims = Object.values(profile.dimensions).filter(d => d.confidence > 0.3);
  const tasteContent = await readTasteFile();
  const hasTaste = !!tasteContent;

  // Load project-scoped data
  let goalContent = null;
  let projectContextText = null;
  try {
    const projectDir = await ensureProjectDir(process.cwd());
    goalContent = await loadGoal(projectDir);
    const projectCtx = await loadProjectContext(projectDir);
    projectContextText = renderProjectContext(projectCtx);
  } catch {
    // No project data yet — that's fine
  }

  const hasGoal = !!goalContent;
  const hasProjectCtx = !!projectContextText;

  if (activeDims.length === 0 && !hasTaste && !hasGoal && !hasProjectCtx) {
    process.exit(0);
  }

  const additionalContext = buildAdditionalContext(profile, tasteContent, goalContent, projectContextText);

  const parts = [];
  if (hasTaste) {
    parts.push('taste.md loaded');
  } else if (activeDims.length > 0) {
    parts.push(`${activeDims.length} dimensions`);
  }
  if (hasGoal) parts.push('goal');
  if (hasProjectCtx) parts.push('project context');

  const output = {
    result: `your-taste: ${parts.length > 0 ? parts.join(' + ') : 'no data yet'}`,
  };

  if (additionalContext) {
    output.hookSpecificOutput = { additionalContext };
  }

  console.log(JSON.stringify(output));
}

main().catch(() => process.exit(0));
