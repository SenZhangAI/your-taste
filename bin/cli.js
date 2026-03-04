#!/usr/bin/env node
import { backfill } from '../src/backfill.js';
import { readObservations, writeObservations } from '../src/observations.js';
import { readProposals, removeProposals } from '../src/proposals.js';
import { readManagedRules, appendManagedRules } from '../src/claudemd.js';
import { loadProjectContext } from '../src/context.js';
import { loadGlobalContext } from '../src/global-context.js';
import { ensureProjectDir } from '../src/project.js';
import { synthesizeProfile } from '../src/analyzer.js';
import { collectForSynthesis } from '../src/signals.js';
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
} else if (command === 'lang') {
  await runLang();
} else if (command === 'synthesize') {
  await runSynthesize();
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
  console.log('  synthesize        Re-run Stage 2 synthesis from existing signals');
  console.log('    --dry-run       Output to stdout instead of writing observations.md');
  console.log('    --signals <p>   Use specific signals file');
  console.log('    --model <m>     Override model for synthesis');
  console.log('  status            Show what your-taste knows about you and this project');
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

  let result;
  try {
    result = await backfill(PROJECTS_DIR, {
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
  } catch (err) {
    console.log('');
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  console.log('');

  if (aborted) {
    console.log('Aborted: some LLM calls failed, but partial results were saved.');
    console.log('Run `taste debug log` for details.\n');
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

  if (result.proposalCount > 0) {
    console.log(`${result.proposalCount} rule proposals added. Run \`taste review\` to review.`);
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

  const claudeMdPath = `${process.env.HOME}/.claude/CLAUDE.md`;
  const rules = await readManagedRules(claudeMdPath);
  if (rules.length > 0) {
    console.log('CLAUDE.md Rules (confirmed)');
    console.log('\u2550'.repeat(26) + '\n');
    for (const rule of rules) {
      console.log(`- ${rule}`);
    }
    console.log('');
  }

  if (!observations && rules.length === 0) {
    console.log('No data yet. Run `taste init` to scan past sessions.');
  }
}

async function runReviewData() {
  const proposals = await readProposals();
  console.log(JSON.stringify({ proposals }, null, 2));
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

  const accepted = decisions.accepted || [];
  const edited = (decisions.edited || []).map(e => e.revised);
  const allApproved = [...accepted, ...edited];

  // Write approved rules to CLAUDE.md
  if (allApproved.length > 0) {
    const claudeMdPath = `${process.env.HOME}/.claude/CLAUDE.md`;
    await appendManagedRules(claudeMdPath, allApproved);
  }

  // Remove all processed proposals
  const toRemove = [
    ...accepted,
    ...(decisions.edited || []).map(e => e.original),
    ...(decisions.dismissed || []),
  ];

  if (toRemove.length > 0) {
    await removeProposals(toRemove);
  }

  console.log(JSON.stringify({ applied: allApproved.length, dismissed: (decisions.dismissed || []).length }));
}

async function runStatus() {
  console.log('your-taste status');
  console.log('═'.repeat(18) + '\n');

  // Observations
  const observations = await readObservations();
  console.log(`Observations: ${observations ? 'present' : 'not yet'}`);

  // CLAUDE.md rules
  const claudeMdPath = `${process.env.HOME}/.claude/CLAUDE.md`;
  const rules = await readManagedRules(claudeMdPath);
  console.log(`CLAUDE.md:   ${rules.length} confirmed rules`);

  // Proposals
  const proposals = await readProposals();
  if (proposals.length > 0) {
    console.log(`Proposals:   ${proposals.length} awaiting review (run: taste review)`);
  }

  // Project context
  let projectDir;
  try {
    projectDir = await ensureProjectDir(process.cwd());
  } catch {
    projectDir = null;
  }

  if (projectDir) {
    const ctx = await loadProjectContext(projectDir);
    const decisionCount = ctx.decisions.length;
    const questionCount = ctx.open_questions.length;

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

function parseSynthesizeFlags() {
  const args = process.argv.slice(3);
  const flags = { dryRun: false, signals: null, model: null };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run') {
      flags.dryRun = true;
    } else if (args[i] === '--signals' && args[i + 1]) {
      flags.signals = args[++i];
    } else if (args[i] === '--model' && args[i + 1]) {
      flags.model = args[++i];
    }
  }

  return flags;
}

async function runSynthesize() {
  const flags = parseSynthesizeFlags();
  const tasteDir = process.env.YOUR_TASTE_DIR || `${process.env.HOME}/.your-taste`;

  // Resolve signals file path: explicit flag > default > .bak fallback
  let signalsPath = flags.signals;
  if (!signalsPath) {
    const defaultPath = `${tasteDir}/init-signals.jsonl`;
    const bakPath = `${defaultPath}.bak`;
    try {
      await fsStat(defaultPath);
      signalsPath = defaultPath;
    } catch {
      try {
        await fsStat(bakPath);
        signalsPath = bakPath;
        console.log(`Using backup signals: ${bakPath}`);
      } catch {
        console.error('No signals file found. Run `taste init` first, or specify --signals <path>.');
        process.exit(1);
      }
    }
  }

  // Read and parse signals
  let entries;
  try {
    const content = await fsReadFile(signalsPath, 'utf8');
    entries = content.split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));
  } catch (err) {
    console.error(`Failed to read signals: ${err.message}`);
    process.exit(1);
  }

  const decisionPoints = collectForSynthesis(entries);
  if (decisionPoints.length === 0) {
    console.log('No decision points found in signals file.');
    process.exit(0);
  }

  console.log(`Synthesizing from ${decisionPoints.length} decision points...`);

  const existingObservations = await readObservations();
  const claudeMdPath = `${process.env.HOME}/.claude/CLAUDE.md`;
  const tasteRules = await readManagedRules(claudeMdPath);

  try {
    const result = await synthesizeProfile(decisionPoints, existingObservations, tasteRules, flags.model);

    if (flags.dryRun) {
      console.log('\n--- observations.md (dry run) ---\n');
      console.log(result);
    } else {
      await writeObservations(result);
      console.log(`\nWrote observations.md (${result.length} chars)`);
    }
  } catch (err) {
    console.error(`Synthesis failed: ${err.message}`);
    process.exit(1);
  }
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
