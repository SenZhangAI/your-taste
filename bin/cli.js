#!/usr/bin/env node
import { backfill } from '../src/backfill.js';

const PROJECTS_DIR = `${process.env.HOME}/.claude/projects`;

const command = process.argv[2];

if (command === 'init') {
  await runInit();
} else {
  console.log('Usage: taste <command>\n');
  console.log('Commands:');
  console.log('  init    Scan past sessions and build your preference profile');
  process.exit(1);
}

async function runInit() {
  console.log('Scanning past sessions...\n');

  const concurrency = process.stdout.isTTY ? 5 : 10;

  const result = await backfill(PROJECTS_DIR, {
    concurrency,
    onProgress({ processed, skipped, total, current }) {
      const pct = Math.round((current / total) * 100);
      const bar = '\u2588'.repeat(Math.round(pct / 5)) + '\u2591'.repeat(20 - Math.round(pct / 5));
      process.stdout.write(`\rAnalyzing... ${bar} ${current}/${total}`);
    },
  });

  console.log('\n');

  if (!result) {
    console.log('No preference signals found in past sessions.');
    console.log('Keep using Claude Code \u2014 your-taste will learn from your conversations.');
    process.exit(0);
  }

  console.log(`Profile built from ${result.processed} sessions (${result.skipped} skipped):\n`);

  const dims = result.profile.dimensions;
  for (const [key, dim] of Object.entries(dims)) {
    if (dim.evidence_count === 0) continue;
    const barLen = Math.round(dim.score * 10);
    const bar = '\u2588'.repeat(barLen) + '\u2591'.repeat(10 - barLen);
    const label = dim.score < 0.35 ? 'low' : dim.score > 0.65 ? 'high' : 'mid';
    const name = key.padEnd(24);
    console.log(`  ${name} ${bar}  ${dim.score.toFixed(2)}  ${label.padEnd(6)} (${dim.evidence_count} signals)`);
  }

  console.log('\nProfile saved to ~/.your-taste/profile.yaml');
}
