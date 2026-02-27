#!/usr/bin/env node
import { readProfile } from '../profile.js';
import { renderInstructions } from '../instruction-renderer.js';

async function main() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  const profile = await readProfile();

  const activeDims = Object.values(profile.dimensions)
    .filter(d => d.confidence > 0.3);

  if (activeDims.length === 0) {
    process.exit(0);
  }

  const instructions = renderInstructions(profile);

  const output = {
    result: `your-taste: ${activeDims.length} preference dimensions active`,
  };

  if (instructions) {
    output.hookSpecificOutput = {
      additionalContext: instructions,
    };
  }

  console.log(JSON.stringify(output));
}

main().catch(() => process.exit(0));
