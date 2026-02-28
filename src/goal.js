import { readFile } from 'fs/promises';
import { join } from 'path';

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
