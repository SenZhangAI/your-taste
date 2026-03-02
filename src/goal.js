import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { readLang, getTemplates } from './lang.js';

export async function loadGoal(projectDir) {
  try {
    const content = await readFile(join(projectDir, 'goal.md'), 'utf8');
    return content.trim() || null;
  } catch {
    return null;
  }
}

export function renderGoalForInjection(goalContent) {
  if (!goalContent) return null;
  return goalContent;
}

function buildGoalTemplate(t) {
  return `${t.goalHeader}

${t.goalWhat}
<!-- ${t.goalWhatDesc} -->

${t.goalConstraints}
<!-- ${t.goalConstraintsDesc} -->

${t.goalArchDecisions}
<!-- ${t.goalArchDesc} -->

${t.goalRejected}
<!-- ${t.goalRejectedDesc} -->
`;
}

export async function createGoalTemplate(projectDir) {
  const goalPath = join(projectDir, 'goal.md');
  try {
    await readFile(goalPath, 'utf8');
    return { path: goalPath, created: false };
  } catch {
    const t = getTemplates(await readLang());
    await mkdir(dirname(goalPath), { recursive: true });
    await writeFile(goalPath, buildGoalTemplate(t), 'utf8');
    return { path: goalPath, created: true };
  }
}
