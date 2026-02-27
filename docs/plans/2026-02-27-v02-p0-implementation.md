# v0.2 P0 Trio Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close the value loop — backfill builds profile, renderer produces directives, injection delivers them to AI every session.

**Architecture:** Three modules forming a pipeline: `backfill.js` feeds `profile.yaml` → `instruction-renderer.js` reads profile and produces text directives → `session-start.js` injects directives via `hookSpecificOutput.additionalContext`. Renderer is a pure function with zero side effects. Backfill reuses the existing transcript→analyze pipeline.

**Tech Stack:** Node.js ESM, vitest, Anthropic SDK (Haiku), YAML

---

### Task 1: Instruction Renderer — Tests

**Files:**
- Create: `tests/instruction-renderer.test.js`

**Step 1: Write the failing tests**

```js
import { describe, it, expect } from 'vitest';
import { renderInstructions } from '../src/instruction-renderer.js';
import { createDefaultProfile } from '../src/profile.js';

describe('instruction renderer', () => {
  it('returns null for default profile (all scores 0.5, zero confidence)', () => {
    const profile = createDefaultProfile();
    expect(renderInstructions(profile)).toBeNull();
  });

  it('renders instruction for high-confidence bold risk_tolerance', () => {
    const profile = createDefaultProfile();
    profile.dimensions.risk_tolerance.score = 0.8;
    profile.dimensions.risk_tolerance.confidence = 0.6;
    const result = renderInstructions(profile);
    expect(result).toContain('rewrite');
    expect(result).not.toBeNull();
  });

  it('renders instruction for high-confidence cautious risk_tolerance', () => {
    const profile = createDefaultProfile();
    profile.dimensions.risk_tolerance.score = 0.2;
    profile.dimensions.risk_tolerance.confidence = 0.6;
    const result = renderInstructions(profile);
    expect(result).toContain('gradual');
  });

  it('skips mid-range scores (0.35-0.65)', () => {
    const profile = createDefaultProfile();
    profile.dimensions.risk_tolerance.score = 0.5;
    profile.dimensions.risk_tolerance.confidence = 0.9;
    expect(renderInstructions(profile)).toBeNull();
  });

  it('skips dimensions with low confidence (<0.3)', () => {
    const profile = createDefaultProfile();
    profile.dimensions.risk_tolerance.score = 0.9;
    profile.dimensions.risk_tolerance.confidence = 0.1;
    expect(renderInstructions(profile)).toBeNull();
  });

  it('combines multiple active dimensions', () => {
    const profile = createDefaultProfile();
    profile.dimensions.risk_tolerance.score = 0.8;
    profile.dimensions.risk_tolerance.confidence = 0.6;
    profile.dimensions.communication_style.score = 0.15;
    profile.dimensions.communication_style.confidence = 0.5;
    const result = renderInstructions(profile);
    expect(result).toContain('rewrite');
    expect(result).toContain('brief');
  });

  it('always includes quality floor when instructions exist', () => {
    const profile = createDefaultProfile();
    profile.dimensions.risk_tolerance.score = 0.8;
    profile.dimensions.risk_tolerance.confidence = 0.6;
    const result = renderInstructions(profile);
    expect(result).toContain('error handling');
    expect(result).toContain('security');
  });

  it('includes context header when instructions exist', () => {
    const profile = createDefaultProfile();
    profile.dimensions.risk_tolerance.score = 0.8;
    profile.dimensions.risk_tolerance.confidence = 0.6;
    const result = renderInstructions(profile);
    expect(result).toMatch(/working style|preferences/i);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/sen/ai/your-taste && npx vitest run tests/instruction-renderer.test.js`
Expected: FAIL — module `../src/instruction-renderer.js` not found

**Step 3: Commit test file**

```bash
cd /Users/sen/ai/your-taste
git add tests/instruction-renderer.test.js
git commit -m "test: add instruction renderer tests for v0.2 P0"
```

---

### Task 2: Instruction Renderer — Implementation

**Files:**
- Create: `src/instruction-renderer.js`

**Step 1: Implement the renderer**

```js
const TEMPLATES = {
  risk_tolerance: [
    {
      range: [0.0, 0.35],
      instruction: 'Prefer gradual migration over rewrites. Include rollback plans for production changes. Favor proven patterns over novel approaches.',
    },
    {
      range: [0.65, 1.0],
      instruction: 'Prefer clean rewrites over patching. Skip backward compatibility unless there\'s a running production dependency. Favor decisive action.',
    },
  ],
  complexity_preference: [
    {
      range: [0.0, 0.35],
      instruction: 'Keep solutions minimal. Fewer abstractions, less code, simpler is better. Only add complexity when it solves a real problem.',
    },
    {
      range: [0.65, 1.0],
      instruction: 'Provide thorough coverage. Include complete abstractions, comprehensive error handling, and full documentation where appropriate.',
    },
  ],
  autonomy_expectation: [
    {
      range: [0.0, 0.35],
      instruction: 'Check before acting on significant decisions. Present options and confirm direction before implementing.',
    },
    {
      range: [0.65, 1.0],
      instruction: 'Act independently. Decide and execute without asking for confirmation on routine decisions. Minimize questions.',
    },
  ],
  communication_style: [
    {
      range: [0.0, 0.35],
      instruction: 'Keep responses brief and action-oriented. Lead with the answer or action, skip lengthy explanations. No filler.',
    },
    {
      range: [0.65, 1.0],
      instruction: 'Provide thorough explanations with context and reasoning. Explain the why, not just the what.',
    },
  ],
  quality_vs_speed: [
    {
      range: [0.0, 0.35],
      instruction: 'Ship fast and iterate. Good enough is enough. Don\'t over-engineer or gold-plate.',
    },
    {
      range: [0.65, 1.0],
      instruction: 'Quality first. Don\'t cut corners on correctness or code clarity to save time. Clean code over quick code.',
    },
  ],
  exploration_tendency: [
    {
      range: [0.0, 0.35],
      instruction: 'Stay focused on the specific task. Minimal scope, targeted changes. Don\'t refactor surroundings.',
    },
    {
      range: [0.65, 1.0],
      instruction: 'Look for improvement opportunities beyond the immediate task. Suggest better approaches, refactor when beneficial.',
    },
  ],
};

const QUALITY_FLOOR = 'Apply these preferences on top of professional best practices. Never compromise error handling at system boundaries, security best practices, or data integrity.';

const HEADER = "This developer's working style preferences (learned from past sessions):";

const CONFIDENCE_THRESHOLD = 0.3;

export function renderInstructions(profile) {
  if (!profile?.dimensions) return null;

  const instructions = [];

  for (const [dimension, templates] of Object.entries(TEMPLATES)) {
    const dim = profile.dimensions[dimension];
    if (!dim || dim.confidence < CONFIDENCE_THRESHOLD) continue;

    for (const { range, instruction } of templates) {
      if (dim.score >= range[0] && dim.score <= range[1]) {
        instructions.push(instruction);
        break;
      }
    }
  }

  if (instructions.length === 0) return null;

  const lines = instructions.map(i => `- ${i}`);
  return `${HEADER}\n\n${lines.join('\n')}\n\n${QUALITY_FLOOR}`;
}
```

**Step 2: Run tests to verify they pass**

Run: `cd /Users/sen/ai/your-taste && npx vitest run tests/instruction-renderer.test.js`
Expected: All 8 tests PASS

**Step 3: Commit**

```bash
cd /Users/sen/ai/your-taste
git add src/instruction-renderer.js
git commit -m "feat: instruction renderer — score-to-directive template engine"
```

---

### Task 3: additionalContext Injection — Test

**Files:**
- Create: `tests/session-start.test.js`

Note: session-start.js is a hook script that reads stdin and writes stdout. Test the integration by testing the logic components (renderInstructions is already tested). This test validates the output format that session-start.js produces.

**Step 1: Write the test**

```js
import { describe, it, expect } from 'vitest';
import { renderInstructions } from '../src/instruction-renderer.js';
import { createDefaultProfile } from '../src/profile.js';

describe('session-start output format', () => {
  it('produces valid JSON with hookSpecificOutput.additionalContext', () => {
    const profile = createDefaultProfile();
    profile.dimensions.risk_tolerance.score = 0.8;
    profile.dimensions.risk_tolerance.confidence = 0.6;

    const instructions = renderInstructions(profile);
    const output = {
      result: 'your-taste: 1 dimensions active',
    };
    if (instructions) {
      output.hookSpecificOutput = { additionalContext: instructions };
    }

    const parsed = JSON.parse(JSON.stringify(output));
    expect(parsed.hookSpecificOutput.additionalContext).toContain('rewrite');
    expect(parsed.result).toContain('your-taste');
  });

  it('omits hookSpecificOutput when no instructions', () => {
    const profile = createDefaultProfile();
    const instructions = renderInstructions(profile);

    const output = { result: 'your-taste: 0 dimensions active' };
    if (instructions) {
      output.hookSpecificOutput = { additionalContext: instructions };
    }

    expect(output.hookSpecificOutput).toBeUndefined();
  });
});
```

**Step 2: Run test to verify it passes** (tests against already-implemented renderer)

Run: `cd /Users/sen/ai/your-taste && npx vitest run tests/session-start.test.js`
Expected: PASS

**Step 3: Commit**

```bash
cd /Users/sen/ai/your-taste
git add tests/session-start.test.js
git commit -m "test: session-start output format validation"
```

---

### Task 4: additionalContext Injection — Implementation

**Files:**
- Modify: `src/hooks/session-start.js`

**Step 1: Update session-start.js**

Replace the full file with:

```js
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
```

**Step 2: Run all tests**

Run: `cd /Users/sen/ai/your-taste && npx vitest run`
Expected: All tests PASS

**Step 3: Commit**

```bash
cd /Users/sen/ai/your-taste
git add src/hooks/session-start.js
git commit -m "feat: inject rendered instructions via additionalContext at session start"
```

---

### Task 5: Backfill — Session Discovery + Tests

**Files:**
- Create: `src/backfill.js`
- Create: `tests/backfill.test.js`

**Step 1: Write the test for session discovery**

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'fs/promises';
import { discoverSessions } from '../src/backfill.js';

const TEST_PROJECTS = '/tmp/your-taste-test-projects';

describe('backfill session discovery', () => {
  beforeEach(async () => {
    await mkdir(`${TEST_PROJECTS}/project-a`, { recursive: true });
    await mkdir(`${TEST_PROJECTS}/project-b`, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_PROJECTS, { recursive: true, force: true });
  });

  it('finds JSONL files in project directories', async () => {
    await writeFile(`${TEST_PROJECTS}/project-a/session1.jsonl`, '{}');
    await writeFile(`${TEST_PROJECTS}/project-a/session2.jsonl`, '{}');
    await writeFile(`${TEST_PROJECTS}/project-b/session3.jsonl`, '{}');

    const sessions = await discoverSessions(TEST_PROJECTS);
    expect(sessions).toHaveLength(3);
    expect(sessions.every(s => s.endsWith('.jsonl'))).toBe(true);
  });

  it('ignores subagent transcripts', async () => {
    await writeFile(`${TEST_PROJECTS}/project-a/session1.jsonl`, '{}');
    await mkdir(`${TEST_PROJECTS}/project-a/session1/subagents`, { recursive: true });
    await writeFile(`${TEST_PROJECTS}/project-a/session1/subagents/agent-abc.jsonl`, '{}');

    const sessions = await discoverSessions(TEST_PROJECTS);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toContain('session1.jsonl');
  });

  it('returns empty array for nonexistent directory', async () => {
    const sessions = await discoverSessions('/tmp/nonexistent-dir-xyz');
    expect(sessions).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/sen/ai/your-taste && npx vitest run tests/backfill.test.js`
Expected: FAIL — `discoverSessions` not found

**Step 3: Implement session discovery**

```js
import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { parseTranscript, extractConversation } from './transcript.js';
import { filterSensitiveData } from './privacy.js';
import { analyzeTranscript } from './analyzer.js';
import { createDefaultProfile, updateProfile } from './profile.js';

export async function discoverSessions(projectsDir) {
  let projectDirs;
  try {
    projectDirs = await readdir(projectsDir);
  } catch {
    return [];
  }

  const sessions = [];

  for (const dir of projectDirs) {
    const projectPath = join(projectsDir, dir);
    let entries;
    try {
      entries = await readdir(projectPath);
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.endsWith('.jsonl')) {
        sessions.push(join(projectPath, entry));
      }
    }
  }

  return sessions;
}

export async function processSession(transcriptPath) {
  const messages = await parseTranscript(transcriptPath);
  if (messages.length < 4) return [];

  const conversation = extractConversation(messages);
  if (conversation.length < 200) return [];

  const filtered = filterSensitiveData(conversation);
  return analyzeTranscript(filtered);
}

export async function backfill(projectsDir, { concurrency = 3, onProgress } = {}) {
  const sessions = await discoverSessions(projectsDir);

  const allSignals = [];
  let processed = 0;
  let skipped = 0;

  // Process in batches of `concurrency`
  for (let i = 0; i < sessions.length; i += concurrency) {
    const batch = sessions.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map(path => processSession(path))
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.length > 0) {
        allSignals.push(...result.value);
        processed++;
      } else {
        skipped++;
      }
    }

    if (onProgress) {
      onProgress({ processed, skipped, total: sessions.length, current: i + batch.length });
    }
  }

  if (allSignals.length === 0) return null;

  const profile = createDefaultProfile();
  await updateProfile(profile, allSignals);
  return { profile, processed, skipped, total: sessions.length };
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/sen/ai/your-taste && npx vitest run tests/backfill.test.js`
Expected: All 3 discovery tests PASS

**Step 5: Commit**

```bash
cd /Users/sen/ai/your-taste
git add src/backfill.js tests/backfill.test.js
git commit -m "feat: backfill session discovery and processing pipeline"
```

---

### Task 6: CLI Entry Point (`taste init`)

**Files:**
- Create: `bin/cli.js`
- Modify: `package.json`

**Step 1: Create the CLI**

```js
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

  const result = await backfill(PROJECTS_DIR, {
    onProgress({ processed, skipped, total, current }) {
      const pct = Math.round((current / total) * 100);
      const bar = '█'.repeat(Math.round(pct / 5)) + '░'.repeat(20 - Math.round(pct / 5));
      process.stdout.write(`\rAnalyzing... ${bar} ${current}/${total}`);
    },
  });

  console.log('\n');

  if (!result) {
    console.log('No preference signals found in past sessions.');
    console.log('Keep using Claude Code — your-taste will learn from your conversations.');
    process.exit(0);
  }

  console.log(`Profile built from ${result.processed} sessions (${result.skipped} skipped):\n`);

  const dims = result.profile.dimensions;
  for (const [key, dim] of Object.entries(dims)) {
    if (dim.evidence_count === 0) continue;
    const barLen = Math.round(dim.score * 10);
    const bar = '█'.repeat(barLen) + '░'.repeat(10 - barLen);
    const label = dim.score < 0.35 ? 'low' : dim.score > 0.65 ? 'high' : 'mid';
    const name = key.padEnd(24);
    console.log(`  ${name} ${bar}  ${dim.score.toFixed(2)}  ${label.padEnd(6)} (${dim.evidence_count} signals)`);
  }

  console.log('\nProfile saved to ~/.your-taste/profile.yaml');
}
```

**Step 2: Add bin field to package.json**

Add to `package.json`:
```json
"bin": {
  "taste": "./bin/cli.js"
}
```

**Step 3: Test CLI manually**

Run: `cd /Users/sen/ai/your-taste && node bin/cli.js --help`
Expected: Shows usage info

Run: `cd /Users/sen/ai/your-taste && node bin/cli.js init`
Expected: Scans sessions, shows progress, builds profile (this is a live test with real Haiku calls — may take a while with 692 sessions)

**Step 4: Run all tests**

Run: `cd /Users/sen/ai/your-taste && npx vitest run`
Expected: All tests PASS

**Step 5: Commit**

```bash
cd /Users/sen/ai/your-taste
git add bin/cli.js package.json
git commit -m "feat: taste CLI with init command for backfill"
```

---

### Task 7: Integration Test — End-to-End

**Files:**
- Create: `tests/integration.test.js`

**Step 1: Write an integration test for the full pipeline**

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rm, mkdir } from 'fs/promises';
import { createDefaultProfile, updateProfile, readProfile } from '../src/profile.js';
import { renderInstructions } from '../src/instruction-renderer.js';

const TEST_DIR = '/tmp/your-taste-integration-test';

describe('end-to-end: profile → render → inject', () => {
  beforeEach(async () => {
    process.env.YOUR_TASTE_DIR = TEST_DIR;
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
    delete process.env.YOUR_TASTE_DIR;
  });

  it('renders instructions from a profile built by multiple signals', async () => {
    const profile = createDefaultProfile();

    // Simulate 5 sessions worth of signals
    const signals = [
      { dimension: 'risk_tolerance', score: 0.85, direction: 'bold', evidence: 'Chose rewrite' },
      { dimension: 'risk_tolerance', score: 0.75, direction: 'bold', evidence: 'Skipped compat' },
      { dimension: 'risk_tolerance', score: 0.9, direction: 'bold', evidence: 'Deleted legacy' },
      { dimension: 'communication_style', score: 0.2, direction: 'direct', evidence: 'Cut explanation' },
      { dimension: 'communication_style', score: 0.15, direction: 'direct', evidence: 'Asked for brevity' },
    ];

    await updateProfile(profile, signals);
    const saved = await readProfile();
    const instructions = renderInstructions(saved);

    expect(instructions).not.toBeNull();
    expect(instructions).toContain('rewrite');
    expect(instructions).toContain('brief');
    expect(instructions).toContain('error handling');
  });

  it('returns null for fresh profile with no evidence', async () => {
    const profile = createDefaultProfile();
    const instructions = renderInstructions(profile);
    expect(instructions).toBeNull();
  });
});
```

**Step 2: Run all tests**

Run: `cd /Users/sen/ai/your-taste && npx vitest run`
Expected: All tests PASS

**Step 3: Commit**

```bash
cd /Users/sen/ai/your-taste
git add tests/integration.test.js
git commit -m "test: end-to-end integration test for profile → render pipeline"
```

---

### Task 8: Version Bump + Final Verification

**Files:**
- Modify: `package.json` (version)
- Modify: `.claude-plugin/plugin.json` (version)

**Step 1: Bump version to 0.2.0**

In `package.json`: change `"version": "0.1.0"` to `"version": "0.2.0"`
In `.claude-plugin/plugin.json`: change `"version": "0.1.0"` to `"version": "0.2.0"`

**Step 2: Run all tests one final time**

Run: `cd /Users/sen/ai/your-taste && npx vitest run`
Expected: All tests PASS

**Step 3: Commit**

```bash
cd /Users/sen/ai/your-taste
git add package.json .claude-plugin/plugin.json
git commit -m "chore: bump version to 0.2.0"
```
