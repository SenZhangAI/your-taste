#!/usr/bin/env node
// Runs when a new Claude Code session starts.
// Outputs brief status about the taste profile.

import { readProfile } from '../profile.js';
import { DIMENSIONS } from '../dimensions.js';

async function main() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  const profile = await readProfile();

  // Count dimensions with meaningful data
  const activeDims = Object.values(profile.dimensions)
    .filter(d => d.confidence > 0.3);

  if (activeDims.length === 0) {
    process.exit(0); // No profile yet -- silent
  }

  const result = `your-taste: ${activeDims.length} preference dimensions learned`;
  console.log(JSON.stringify({ result }));
}

main().catch(() => process.exit(0));
