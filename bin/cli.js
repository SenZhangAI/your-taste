#!/usr/bin/env node
import { backfill } from '../src/backfill.js';
import { readProfile } from '../src/profile.js';
import { DIMENSIONS, getNarrative } from '../src/dimensions.js';
import { readPending, removePendingRules } from '../src/pending.js';
import { readTasteFile, appendRules } from '../src/taste-file.js';
import { readObservations } from '../src/observations.js';
import { loadGoal, createGoalTemplate } from '../src/goal.js';
import { loadProjectContext } from '../src/context.js';
import { loadGlobalContext } from '../src/global-context.js';
import { ensureProjectDir } from '../src/project.js';
import { debug, isDebug, FLAG_PATH, LOG_PATH } from '../src/debug.js';
import { readLang, writeLang, hasLangFile, languageName } from '../src/lang.js';
import { writeFile, rm, mkdir, readFile as fsReadFile, stat as fsStat } from 'fs/promises';
import { dirname } from 'path';

const PROJECTS_DIR = `${process.env.HOME}/.claude/projects`;

// Parse --debug before command dispatch (sets env for child processes too)
if (process.argv.includes('--debug')) {
  process.env.__YOUR_TASTE_DEBUG_INTERNAL = '1';
  // Re-import to pick up the flag (module already loaded, so use env directly)
}

const command = process.argv[2];

if (command === 'init') {
  await runInit();
} else if (command === 'show') {
  await runShow();
} else if (command === 'review-data') {
  await runReviewData();
} else if (command === 'review-apply') {
  await runReviewApply();
} else if (command === 'status') {
  await runStatus();
} else if (command === 'goal') {
  await runGoal();
} else if (command === 'lang') {
  await runLang();
} else if (command === 'debug') {
  await runDebug();
} else {
  console.log('Usage: taste <command> [options]\n');
  console.log('Commands:');
  console.log('  init              Scan past sessions and build your taste profile');
  console.log('    --all           Scan all sessions (slow, higher cost)');
  console.log('    --days <N>      Scan sessions from last N days');
  console.log('    --max <N>       Scan at most N sessions (default: 50)');
  console.log('  show              Display your taste profile');
  console.log('  status            Show what your-taste knows about you and this project');
  console.log('  goal              Show goal file path for current project (creates template if needed)');
  console.log('  review-data       Output pending rules as JSON (for skills)');
  console.log('  review-apply      Apply review decisions from stdin JSON (for skills)');
  console.log('  lang [code]       Show or set preferred language (zh, en, ja, ...)');
  console.log('  debug on|off|log  Toggle debug mode or view debug log');
  console.log('\nGlobal options:');
  console.log('  --debug           Show detailed debug output to stderr (this run only)');
  process.exit(1);
}

function parseInitFlags() {
  const args = process.argv.slice(3);
  const filter = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--all') {
      filter.all = true;
    } else if (args[i] === '--days' && args[i + 1]) {
      filter.days = parseInt(args[++i], 10);
    } else if (args[i] === '--max' && args[i + 1]) {
      filter.maxSessions = parseInt(args[++i], 10);
    }
  }

  return filter;
}

async function runInit() {
  const filter = parseInitFlags();

  if (filter.all) {
    console.log('Scanning ALL past sessions (--all)...\n');
  } else if (filter.days) {
    console.log(`Scanning sessions from the last ${filter.days} days...\n`);
  } else {
    const max = filter.maxSessions || 50;
    console.log(`Scanning up to ${max} most recent sessions (use --all for full scan)...\n`);
  }

  let lastLog = 0;
  let aborted = false;

  const result = await backfill(PROJECTS_DIR, {
    filter,
    currentProjectPath: process.cwd(),
    onProgress({ phase, extracted, skipped, total, current, aborted: a }) {
      if (a) { aborted = true; return; }
      if (phase === 'pass2') {
        if (process.stdout.isTTY) process.stdout.write('\rSynthesizing observations...');
        else console.log('Synthesizing observations...');
        return;
      }
      if (process.stdout.isTTY) {
        const pct = Math.round((current / total) * 100);
        const bar = '\u2588'.repeat(Math.round(pct / 5)) + '\u2591'.repeat(20 - Math.round(pct / 5));
        process.stdout.write(`\rScanning sessions... ${bar} ${current}/${total}`);
      } else {
        const pct = Math.round((current / total) * 100);
        const bucket = Math.floor(pct / 10) * 10;
        if (bucket > lastLog || current === total) {
          lastLog = bucket;
          console.log(`Scanning sessions... ${current}/${total} (${pct}%)`);
        }
      }
    },
  });

  console.log('');

  if (aborted) {
    console.log('Aborted: multiple consecutive LLM failures. Run `taste debug log` for details.');
  }

  if (!result) {
    console.log('No taste signals found in past sessions.');
    console.log('Keep using Claude Code \u2014 your-taste will learn from your conversations.');
    process.exit(0);
  }

  console.log(`Analysis complete: ${result.extracted} sessions analyzed (${result.skipped} skipped).\n`);

  if (result.observations) {
    console.log('Observations saved to ~/.your-taste/observations.md');
  }

  const tasteContent = await readTasteFile();
  if (tasteContent) {
    console.log('Behavioral rules: ~/.your-taste/taste.md');
  }
}

async function runShow() {
  const observations = await readObservations();
  if (observations) {
    console.log('Observations');
    console.log('\u2550'.repeat(12) + '\n');
    console.log(observations);
    console.log('');
  }

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

async function runStatus() {
  const profile = await readProfile();
  const activeDims = Object.values(profile.dimensions).filter(d => d.confidence > 0.3);
  const tasteContent = await readTasteFile();

  console.log('your-taste status');
  console.log('═'.repeat(18) + '\n');

  // Profile
  const dimCount = activeDims.length;
  const ruleCount = tasteContent ? tasteContent.split('\n').filter(l => l.startsWith('- ')).length : 0;
  console.log(`Profile:     ${dimCount} dimensions active, ${ruleCount} behavioral rules`);

  // Pending rules
  const pending = await readPending();
  const pendingCount = pending.rules ? pending.rules.length : 0;
  if (pendingCount > 0) {
    console.log(`Pending:     ${pendingCount} rules awaiting review (run: taste review)`);
  }

  // Project context
  let projectDir;
  try {
    projectDir = await ensureProjectDir(process.cwd());
  } catch {
    projectDir = null;
  }

  if (projectDir) {
    const goal = await loadGoal(projectDir);
    const ctx = await loadProjectContext(projectDir);
    const hasGoal = !!goal;
    const decisionCount = ctx.decisions.length;
    const questionCount = ctx.open_questions.length;

    console.log(`Goal:        ${hasGoal ? 'set' : 'not set'}`);
    console.log(`Context:     ${decisionCount} decisions, ${questionCount} open questions`);
    if (ctx.last_session) {
      console.log(`Last session: ${ctx.last_session}`);
    }
  } else {
    console.log('Project:     (not in a tracked project)');
  }

  // Global context
  try {
    const globalCtx = await loadGlobalContext();
    const focusCount = globalCtx.focus ? globalCtx.focus.length : 0;
    console.log(`Global:      ${focusCount} cross-project focus areas`);
  } catch {
    console.log('Global:      (no global context)');
  }

  console.log('');
}

async function runGoal() {
  let projectDir;
  try {
    projectDir = await ensureProjectDir(process.cwd());
  } catch {
    console.error('Could not determine project directory for current path.');
    process.exit(1);
  }

  const { path, created } = await createGoalTemplate(projectDir);

  if (created) {
    console.log(`Created goal template: ${path}`);
    console.log('Edit this file to set your project vision, constraints, and architectural decisions.');
  } else {
    console.log(`Goal file: ${path}`);
  }
}

async function runLang() {
  const code = process.argv[3];
  if (!code) {
    const current = await readLang();
    const hasFile = await hasLangFile();
    if (hasFile) {
      console.log(`Language: ${current} (${languageName(current)})`);
    } else {
      console.log(`Language: ${current} (default — run \`taste lang <code>\` to set)`);
    }
    return;
  }
  await writeLang(code);
  console.log(`Language set to: ${code} (${languageName(code)})`);
}

async function runDebug() {
  const sub = process.argv[3];
  if (sub === 'on') {
    await mkdir(dirname(FLAG_PATH), { recursive: true });
    await writeFile(FLAG_PATH, '');
    // Clear previous log
    await rm(LOG_PATH, { force: true });
    console.log('Debug mode ON — hooks will log to:');
    console.log(`  ${LOG_PATH}`);
  } else if (sub === 'off') {
    await rm(FLAG_PATH, { force: true });
    console.log('Debug mode OFF.');
    console.log(`Log preserved at: ${LOG_PATH}`);
  } else if (sub === 'log') {
    try {
      const content = await fsReadFile(LOG_PATH, 'utf8');
      process.stdout.write(content);
    } catch {
      console.log('No debug log found.');
    }
  } else {
    const on = isDebug();
    console.log(`Debug mode: ${on ? 'ON' : 'OFF'}`);
    console.log(`\nUsage: taste debug on|off|log`);
  }
}
