import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';

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

const GOAL_TEMPLATE = `# Project Goal

## What
<!-- What is this project? One-sentence description. -->

## Constraints
<!-- Technical constraints, business requirements, non-negotiable rules. -->

## Architecture Decisions
<!-- Key decisions and WHY they were made. -->

## Rejected Approaches
<!-- What was considered and rejected, and why. Prevents re-exploring dead ends. -->
`;

export async function createGoalTemplate(projectDir) {
  const goalPath = join(projectDir, 'goal.md');
  try {
    await readFile(goalPath, 'utf8');
    return { path: goalPath, created: false };
  } catch {
    await mkdir(dirname(goalPath), { recursive: true });
    await writeFile(goalPath, GOAL_TEMPLATE, 'utf8');
    return { path: goalPath, created: true };
  }
}
