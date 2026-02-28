#!/usr/bin/env node
import { backfill } from '../src/backfill.js';
import { readProfile } from '../src/profile.js';
import { DIMENSIONS, getNarrative } from '../src/dimensions.js';
import { readPending, removePendingRules } from '../src/pending.js';
import { appendRules } from '../src/taste-file.js';

const PROJECTS_DIR = `${process.env.HOME}/.claude/projects`;

const command = process.argv[2];

if (command === 'init') {
  await runInit();
} else if (command === 'show') {
  await runShow();
} else if (command === 'review-data') {
  await runReviewData();
} else if (command === 'review-apply') {
  await runReviewApply();
} else {
  console.log('Usage: taste <command>\n');
  console.log('Commands:');
  console.log('  init          Scan past sessions and build your preference profile');
  console.log('  show          Display your taste profile');
  console.log('  review-data   Output pending rules as JSON (for skills)');
  console.log('  review-apply  Apply review decisions from stdin JSON (for skills)');
  process.exit(1);
}

async function runInit() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY is not set.\n');
    console.error('your-taste needs an Anthropic API key to analyze your sessions.');
    console.error('Set it in your shell profile:\n');
    console.error('  export ANTHROPIC_API_KEY=sk-ant-...\n');
    process.exit(1);
  }

  console.log('Scanning past sessions...\n');

  const concurrency = process.stdout.isTTY ? 5 : 10;
  let lastLog = 0;

  const result = await backfill(PROJECTS_DIR, {
    concurrency,
    onProgress({ processed, skipped, total, current }) {
      // In non-TTY (Claude Code Bash), use newlines at intervals
      // In TTY (terminal), use carriage return for in-place update
      if (process.stdout.isTTY) {
        const pct = Math.round((current / total) * 100);
        const bar = '\u2588'.repeat(Math.round(pct / 5)) + '\u2591'.repeat(20 - Math.round(pct / 5));
        process.stdout.write(`\rAnalyzing... ${bar} ${current}/${total}`);
      } else {
        const pct = Math.round((current / total) * 100);
        // Log every 10%
        const bucket = Math.floor(pct / 10) * 10;
        if (bucket > lastLog || current === total) {
          lastLog = bucket;
          console.log(`Analyzing... ${current}/${total} (${pct}%)`);
        }
      }
    },
  });

  console.log('');

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

async function runShow() {
  const profile = await readProfile();

  console.log('Your Taste Profile');
  console.log('\u2550'.repeat(18) + '\n');

  let hasData = false;
  for (const [key, dim] of Object.entries(profile.dimensions)) {
    if (dim.evidence_count === 0) continue;
    hasData = true;

    const barLen = Math.round(dim.score * 10);
    const bar = '\u2588'.repeat(barLen) + '\u2591'.repeat(10 - barLen);
    const label = dim.score < 0.35 ? 'low' : dim.score > 0.65 ? 'high' : 'balanced';
    const confPct = Math.round(dim.confidence * 100);
    const name = key.padEnd(20);

    console.log(`${name} ${bar}  ${dim.score.toFixed(2)}  ${label.padEnd(10)} (${dim.evidence_count} obs, confidence: ${confPct}%)`);

    const narrative = getNarrative(key, dim.score);
    if (narrative && dim.confidence >= 0.3) {
      console.log(`  ${narrative}`);
    } else {
      console.log('  (not enough data yet)');
    }
    console.log();
  }

  if (!hasData) {
    console.log('No profile data yet. Run `taste init` to scan past sessions.');
  }
}

async function runReviewData() {
  const pending = await readPending();
  console.log(JSON.stringify(pending, null, 2));
}

async function runReviewApply() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  let decisions;
  try {
    decisions = JSON.parse(input);
  } catch {
    console.error(JSON.stringify({ error: 'Invalid JSON input' }));
    process.exit(1);
  }
  const pending = await readPending();

  // Apply accepted rules to taste.md
  const accepted = decisions.accepted || [];
  const edited = (decisions.edited || []).map(e => e.revised);
  const allApproved = [...accepted, ...edited];

  if (allApproved.length > 0) {
    await appendRules(allApproved);
  }

  // Remove accepted, edited originals, and dismissed from pending
  const toRemove = [
    ...accepted,
    ...(decisions.edited || []).map(e => e.original),
    ...(decisions.dismissed || []),
  ];

  if (toRemove.length > 0) {
    await removePendingRules(pending, toRemove);
  }

  console.log(JSON.stringify({ applied: allApproved.length, dismissed: (decisions.dismissed || []).length }));
}
