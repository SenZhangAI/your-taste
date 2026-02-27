#!/usr/bin/env node
import { readProfile } from '../profile.js';
import { renderInstructions } from '../instruction-renderer.js';
import { readTasteFile } from '../taste-file.js';

const QUALITY_FLOOR = 'Apply these preferences on top of professional best practices. Never compromise error handling at system boundaries, security best practices, or data integrity.';

export function buildAdditionalContext(profile, tasteContent) {
  // taste.md takes priority when it has content
  if (tasteContent) {
    return `${tasteContent}\n\n${QUALITY_FLOOR}`;
  }

  // Fall back to template rendering
  return renderInstructions(profile);
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  const profile = await readProfile();

  const activeDims = Object.values(profile.dimensions)
    .filter(d => d.confidence > 0.3);

  const tasteContent = await readTasteFile();
  const hasTaste = !!tasteContent;

  if (activeDims.length === 0 && !hasTaste) {
    process.exit(0);
  }

  const additionalContext = buildAdditionalContext(profile, tasteContent);

  const source = hasTaste ? 'taste.md' : 'templates';
  const output = {
    result: `your-taste: ${activeDims.length} dimensions, source: ${source}`,
  };

  if (additionalContext) {
    output.hookSpecificOutput = {
      additionalContext,
    };
  }

  console.log(JSON.stringify(output));
}

main().catch(() => process.exit(0));
