#!/usr/bin/env node
import { readProfile } from '../profile.js';
import { renderInstructions } from '../instruction-renderer.js';
import { readTasteFile } from '../taste-file.js';
import { loadContext, renderContext } from '../context.js';

const QUALITY_FLOOR = 'Apply these preferences on top of professional best practices. Never compromise error handling at system boundaries, security best practices, or data integrity.';

export function buildAdditionalContext(profile, tasteContent, context) {
  let base;
  // taste.md takes priority when it has content
  if (tasteContent) {
    base = `${tasteContent}\n\n${QUALITY_FLOOR}`;
  } else {
    base = renderInstructions(profile);
  }

  const contextText = context ? renderContext(context) : null;

  if (!base && !contextText) return null;
  if (!base) return contextText;
  if (!contextText) return base;
  return `${base}\n\n${contextText}`;
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
  const context = await loadContext();
  const hasContext = context.focus.length > 0 || context.decisions.length > 0 || context.open_questions.length > 0;

  if (activeDims.length === 0 && !hasTaste && !hasContext) {
    process.exit(0);
  }

  const additionalContext = buildAdditionalContext(profile, tasteContent, context);

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
