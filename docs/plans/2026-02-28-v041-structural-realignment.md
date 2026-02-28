# v0.4.1 Structural Realignment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Realign codebase structure with the Context Accelerator vision — context becomes the primary concern, preference profiling becomes secondary.

**Architecture:** Six targeted changes across 3 tiers. Tier 1 fixes the critical session_quality gate that silently discards context, renames the prompt to reflect its true role, and adds context validation. Tier 2 adds user-facing commands (`taste status`, `taste goal`) and updates the SessionStart result string. Tier 3 preserves context during backfill, fixes priority label naming in user-prompt.

**Tech Stack:** Node.js ESM, vitest, Claude Code plugin hooks (SessionStart/SessionEnd/UserPromptSubmit)

---

## Task 1: Remove session_quality Gate from Analyzer

The `session_quality === 'none'` early-return at `src/analyzer.js:35` discards ALL output including context when Haiku judges a session has no preference signals. A pure Q&A debugging session may have zero taste signals but rich strategic context. This gate must be removed so context flows through regardless of preference signal quality.

**Files:**
- Modify: `src/analyzer.js:30-50`
- Modify: `tests/analyzer.test.js:30-35, 96-100`

**Step 1: Update the test for session_quality=none to expect context to survive**

In `tests/analyzer.test.js`, find the test at line 30 ("returns empty for session_quality none") and the test at line 96 ("returns null context on session_quality none"). Change them to verify that:
- signals and rules are still empty for quality=none
- BUT context is preserved if present

Also add a new test: session_quality=none WITH session_context present should return the context.

```js
// Replace test at line 30-35:
it('returns empty signals and rules for session_quality none', () => {
  const json = JSON.stringify({ signals: [], candidate_rules: [], session_quality: 'none' });
  const result = parseAnalysisResponse(json);
  expect(result.signals).toEqual([]);
  expect(result.rules).toEqual([]);
  expect(result.context).toBeNull();
});

// Replace test at line 96-100:
it('preserves context even when session_quality is none', () => {
  const json = JSON.stringify({
    signals: [],
    candidate_rules: [],
    session_quality: 'none',
    session_context: {
      topics: ['debugging API integration'],
      decisions: ['use retry with exponential backoff'],
      open_questions: [],
    },
  });
  const result = parseAnalysisResponse(json);
  expect(result.signals).toEqual([]);
  expect(result.rules).toEqual([]);
  expect(result.context).toEqual({
    topics: ['debugging API integration'],
    decisions: ['use retry with exponential backoff'],
    open_questions: [],
  });
});
```

**Step 2: Run tests to verify the new test fails**

Run: `cd /Users/sen/ai/your-taste && npx vitest run tests/analyzer.test.js`
Expected: The "preserves context even when session_quality is none" test FAILS because the current code returns `{ signals: [], rules: [], context: null }` at line 35.

**Step 3: Remove the session_quality gate**

In `src/analyzer.js`, remove line 35:
```js
// DELETE this line:
if (result.session_quality === 'none') return { signals: [], rules: [], context: null };
```

The signals/rules filtering logic at lines 37-43 already handles empty arrays correctly — when there are no signals, the filter returns `[]`. No gate needed.

**Step 4: Run tests to verify they pass**

Run: `cd /Users/sen/ai/your-taste && npx vitest run tests/analyzer.test.js`
Expected: ALL tests PASS including the updated ones.

**Step 5: Commit**

```bash
git add src/analyzer.js tests/analyzer.test.js
git commit -m "fix: remove session_quality gate that silently discarded context"
```

---

## Task 2: Add Context Validation in Analyzer

Currently `src/analyzer.js:45` accepts any truthy value as context with zero validation: `const context = result.session_context || null`. Context should be validated the same way signals and rules are — check structure, filter invalid entries.

**Files:**
- Modify: `src/analyzer.js:45`
- Modify: `tests/analyzer.test.js` (add new tests)

**Step 1: Write failing tests for context validation**

Add these tests to `tests/analyzer.test.js`:

```js
it('validates context structure — filters non-string array items', () => {
  const json = JSON.stringify({
    signals: [],
    candidate_rules: [],
    session_quality: 'medium',
    session_context: {
      topics: ['valid topic', 123, null, ''],
      decisions: ['valid decision', false],
      open_questions: ['valid question'],
    },
  });
  const result = parseAnalysisResponse(json);
  expect(result.context.topics).toEqual(['valid topic']);
  expect(result.context.decisions).toEqual(['valid decision']);
  expect(result.context.open_questions).toEqual(['valid question']);
});

it('returns null context when session_context has no valid entries', () => {
  const json = JSON.stringify({
    signals: [],
    candidate_rules: [],
    session_quality: 'medium',
    session_context: {
      topics: [],
      decisions: [],
      open_questions: [],
    },
  });
  const result = parseAnalysisResponse(json);
  expect(result.context).toBeNull();
});

it('handles non-object session_context gracefully', () => {
  const json = JSON.stringify({
    signals: [],
    candidate_rules: [],
    session_quality: 'medium',
    session_context: 'not an object',
  });
  const result = parseAnalysisResponse(json);
  expect(result.context).toBeNull();
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/sen/ai/your-taste && npx vitest run tests/analyzer.test.js`
Expected: FAIL — current code passes through unvalidated context.

**Step 3: Implement context validation**

In `src/analyzer.js`, replace line 45 (`const context = result.session_context || null;`) with:

```js
const context = validateContext(result.session_context);
```

Add a helper function (inside the file, before `parseAnalysisResponse` or after it):

```js
function validateContext(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const filterStrings = arr =>
    (Array.isArray(arr) ? arr : []).filter(s => typeof s === 'string' && s.trim().length > 0);

  const topics = filterStrings(raw.topics);
  const decisions = filterStrings(raw.decisions);
  const open_questions = filterStrings(raw.open_questions);

  if (topics.length === 0 && decisions.length === 0 && open_questions.length === 0) return null;

  return { topics, decisions, open_questions };
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/sen/ai/your-taste && npx vitest run tests/analyzer.test.js`
Expected: ALL tests PASS.

**Step 5: Commit**

```bash
git add src/analyzer.js tests/analyzer.test.js
git commit -m "feat: add context validation matching signal/rule validation standards"
```

---

## Task 3: Rename and Restructure the Analysis Prompt

The prompt file `prompts/extract-preferences.md` opens with "You are a preference analyst" and treats context as an afterthought (section 5 of 6, introduced with "Beyond"). Rename to `analyze-session.md` and reframe the identity: the primary job is analyzing the session holistically (context + preferences + rules), not just extracting preferences.

**Files:**
- Rename: `prompts/extract-preferences.md` → `prompts/analyze-session.md`
- Modify: `prompts/analyze-session.md` (reframe content)
- Modify: `src/analyzer.js:7` (update path reference)
- Modify: `tests/integration.test.js` (if it references the old filename)

**Step 1: Rename the file**

```bash
cd /Users/sen/ai/your-taste && git mv prompts/extract-preferences.md prompts/analyze-session.md
```

**Step 2: Update the path in analyzer.js**

In `src/analyzer.js`, change line 7 from:
```js
new URL('../prompts/extract-preferences.md', import.meta.url),
```
to:
```js
new URL('../prompts/analyze-session.md', import.meta.url),
```

**Step 3: Restructure the prompt content**

Rewrite `prompts/analyze-session.md`. The key changes:
- Identity: "session analyst" not "preference analyst"
- Structure: Context extraction moves UP (before signals), signals move DOWN
- session_quality: redefine to reflect overall session value (context OR preferences), not just preference signal count

New content for `prompts/analyze-session.md`:

```markdown
You are a session analyst for an AI coding assistant. Your job is to extract TWO things from each conversation:

1. **Strategic context** — what was discussed, decided, and left open
2. **Preference signals** — the user's decision-making style (taste, not skill)

## Important Distinction: Taste vs Skill

You are extracting the user's TASTE (direction, values, preferences) — NOT their skill level.

- "User chose gradual migration" → taste signal (risk_tolerance: cautious)
- "User wrote bad variable names" → NOT a taste signal (skill limitation, ignore)
- "User rejected verbose explanation" → taste signal (communication_style: direct)
- "User didn't know about feature X" → NOT a taste signal (knowledge gap, ignore)

## Session Context Extraction

Extract the STRATEGIC CONTEXT of this conversation:

- **topics**: What major subjects were discussed? (1-3 items, abstract level only)
- **decisions**: What was explicitly decided? Only clear decisions, not preferences.
- **open_questions**: What was raised but left unresolved?

Keep entries concise (max 15 words each). Focus on strategic direction, not implementation details.
No code, no variable names, no file paths — just the strategic what and why.
If the session has no meaningful strategic content, omit session_context entirely.

## Preference Dimensions

Score each on 0.0-1.0 scale:

{{DIMENSIONS}}

## Preference Signal Instructions

1. Find moments where the AI proposed something and the user reacted (accepted, modified, rejected, or requested something different)
2. For each reaction, determine if it reveals a TASTE PREFERENCE (values/style) or just a SKILL/KNOWLEDGE issue
3. **Infer the WHY, not just the WHAT.** Users think A → B → C then say C. When a user makes a specific correction (C), trace back: what underlying principle (A) drove this correction? Extract A, not C.
   - Example: User gives specific numeric counterexample → don't extract "prefers concrete over abstract". Extract the underlying principle: "thinks systemically, traces full usage paths to surface hidden costs"
   - Example: User corrects messaging from philosophical to pain-point-first → don't extract "prefers concrete". Extract: "designs for user empathy, matches communication to audience"
4. Only report taste preferences. Ignore skill-related corrections.
5. For each signal, provide:
   - Which dimension it maps to
   - The score (0.0-1.0)
   - Direction label (e.g., "cautious", "direct", "minimalist")
   - Brief abstract evidence (NO business details, NO code, NO names)
   - Summary (one short sentence describing the preference)
6. If the conversation has no meaningful decision signals, return empty array

## Behavioral Rules

Beyond dimension scores, extract concrete behavioral rules or design principles the user demonstrates through their decisions.

Rules should be:
- Short, actionable statements ("X over Y", "Always X", "Never Y")
- Abstract — no business details, code snippets, or names
- Genuinely instructive — useful for guiding AI behavior in future sessions

Only extract rules the user strongly or repeatedly demonstrates. Not every preference becomes a rule. Quality over quantity — 0-3 rules per session is typical.

{{PENDING_RULES}}

## Output Format

Return ONLY valid JSON (no markdown fencing):

{
  "session_context": {
    "topics": ["product architecture redesign"],
    "decisions": ["use event-driven approach for decoupling"],
    "open_questions": ["migration timeline for legacy components"]
  },
  "signals": [
    {
      "dimension": "risk_tolerance",
      "score": 0.2,
      "direction": "cautious",
      "evidence": "Preferred gradual migration pattern over immediate replacement",
      "summary": "Prefers gradual changes, avoids aggressive refactoring"
    }
  ],
  "candidate_rules": [
    "Clean breaks over gradual migration"
  ],
  "session_quality": "high|medium|low|none"
}

session_quality indicates the overall analytical value of this session:
- "high": rich context AND/OR 3+ clear preference signals
- "medium": some context or 1-2 preference signals
- "low": minimal context, weak or ambiguous signals
- "none": no meaningful content (e.g., aborted session, single-message exchange)

session_context captures the strategic-level topics, decisions, and open questions from this conversation. Only include when the session has substantive strategic content. Omit for trivially short or aborted sessions.

## Conversation Transcript

{{TRANSCRIPT}}
```

**Step 4: Run all tests to verify nothing broke**

Run: `cd /Users/sen/ai/your-taste && npx vitest run`
Expected: ALL tests PASS (the prompt rename + content change doesn't break tests because tests mock at the `parseAnalysisResponse` level, not at the prompt level).

**Step 5: Check integration test for prompt path reference**

Run: `grep -r "extract-preferences" /Users/sen/ai/your-taste/tests/`
If any matches found, update those references to `analyze-session`.

**Step 6: Commit**

```bash
git add prompts/analyze-session.md src/analyzer.js
git rm prompts/extract-preferences.md 2>/dev/null  # if git mv didn't handle it
git add tests/  # in case integration test changed
git commit -m "refactor: rename prompt to analyze-session, reframe as session analyst

Context extraction now leads; preference signals follow. session_quality
redefined to reflect overall session value, not just preference count."
```

---

## Task 4: Add `taste status` Command

Users currently have no way to see what the plugin knows about their current project context. `taste status` shows the full picture: taste profile summary + project goal status + context status + global context status.

**Files:**
- Modify: `bin/cli.js` (add `status` command, ~30 lines)
- Modify: `src/project.js` (need to export a function that checks if project dir exists)

**Step 1: Write the status command**

In `bin/cli.js`, add the following imports at the top (some already exist, add what's missing):

```js
import { loadGoal } from '../src/goal.js';
import { loadProjectContext } from '../src/context.js';
import { loadGlobalContext } from '../src/global-context.js';
import { ensureProjectDir } from '../src/project.js';
```

Add `status` to the command routing (after line 10, before the `else` block):

```js
} else if (command === 'status') {
  await runStatus();
```

Add `status` to the help text:

```
console.log('  status            Show what your-taste knows about you and this project');
```

Add the `runStatus` function:

```js
async function runStatus() {
  // Taste profile
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
    const topicCount = globalCtx.topics ? globalCtx.topics.length : 0;
    console.log(`Global:      ${topicCount} cross-project topics`);
  } catch {
    console.log('Global:      (no global context)');
  }

  console.log('');
}
```

**Step 2: Run the status command manually to verify**

Run: `cd /Users/sen/ai/your-taste && node bin/cli.js status`
Expected: Output showing profile, project, and global context status.

**Step 3: Commit**

```bash
git add bin/cli.js
git commit -m "feat: add taste status command for full context overview"
```

---

## Task 5: Add `taste goal` Command

Users need a way to create/edit `goal.md` for their current project without manually finding the hashed project directory path. `taste goal` opens the goal file for the current project, creating a template if it doesn't exist.

**Files:**
- Modify: `bin/cli.js` (add `goal` command)
- Modify: `src/goal.js` (add goal template creation)

**Step 1: Add goal template function to goal.js**

In `src/goal.js`, add:

```js
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';

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
```

Update the existing import at top of goal.js — change from:
```js
import { readFile } from 'fs/promises';
import { join } from 'path';
```
to:
```js
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
```

**Step 2: Add `goal` command to cli.js**

Add to command routing:
```js
} else if (command === 'goal') {
  await runGoal();
```

Add to help text:
```
console.log('  goal              Show goal file path for current project (creates template if needed)');
```

Add the function:

```js
async function runGoal() {
  const { ensureProjectDir } = await import('../src/project.js');
  const { createGoalTemplate } = await import('../src/goal.js');

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
```

**Step 3: Test manually**

Run: `cd /Users/sen/ai/your-taste && node bin/cli.js goal`
Expected: Shows goal file path, creates template if none exists.

**Step 4: Commit**

```bash
git add bin/cli.js src/goal.js
git commit -m "feat: add taste goal command for project goal management"
```

---

## Task 6: Update SessionStart Result String

The SessionStart hook result string at `src/hooks/session-start.js:60` only reports preference dimensions: `your-taste: ${activeDims.length} dimensions, source: ${source}`. This should reflect all loaded context, not just preferences.

**Files:**
- Modify: `src/hooks/session-start.js:58-61`
- Modify: `tests/session-start.test.js` (update expected output)

**Step 1: Write failing test**

Add a test to `tests/session-start.test.js`:

```js
it('builds context-aware result string', async () => {
  // This test validates the result string format in the main function
  // We test buildAdditionalContext + the result string logic together
  const profile = createDefaultProfile();
  profile.dimensions.risk_tolerance.score = 0.8;
  profile.dimensions.risk_tolerance.confidence = 0.6;
  const goalContent = '# Goal';
  const ctxText = '## Project Context';

  // buildAdditionalContext returns the combined content
  const result = buildAdditionalContext(profile, null, goalContent, ctxText);
  expect(result).toContain('rewrite');
  expect(result).toContain('# Goal');
  expect(result).toContain('## Project Context');
});
```

Note: The result string is built in the `main()` function which reads from stdin and isn't directly testable as a unit. The key change is in the `main()` function itself.

**Step 2: Update the result string in session-start.js main()**

In `src/hooks/session-start.js`, replace lines 58-61:

```js
const source = hasTaste ? 'taste.md' : 'templates';
const output = {
  result: `your-taste: ${activeDims.length} dimensions, source: ${source}`,
};
```

With:

```js
const parts = [];
if (hasTaste) {
  parts.push('taste.md loaded');
} else if (activeDims.length > 0) {
  parts.push(`${activeDims.length} dimensions`);
}
if (hasGoal) parts.push('goal');
if (hasProjectCtx) parts.push('project context');

const output = {
  result: `your-taste: ${parts.length > 0 ? parts.join(' + ') : 'no data yet'}`,
};
```

**Step 3: Run tests**

Run: `cd /Users/sen/ai/your-taste && npx vitest run tests/session-start.test.js`
Expected: PASS (existing tests don't assert on the result string, they test `buildAdditionalContext`).

**Step 4: Run full test suite**

Run: `cd /Users/sen/ai/your-taste && npx vitest run`
Expected: ALL tests PASS.

**Step 5: Commit**

```bash
git add src/hooks/session-start.js
git commit -m "feat: SessionStart result string now reports all loaded context types"
```

---

## Task 7: Preserve Context in Backfill

`src/backfill.js:77` destructures and discards context: `const { signals } = await analyzeTranscript(filtered)`. The backfill pipeline should preserve context so `taste init` can also seed project context, not just preferences.

**Files:**
- Modify: `src/backfill.js:69-78` (processSession return value)
- Modify: `src/backfill.js:84-113` (backfill function to handle context)
- Modify: `tests/backfill.test.js` (update expectations)

**Step 1: Update processSession to return context**

In `src/backfill.js`, change `processSession` (lines 69-78):

From:
```js
export async function processSession(transcriptPath) {
  const messages = await parseTranscript(transcriptPath);
  if (messages.length < 4) return [];

  const conversation = extractConversation(messages);
  if (conversation.length < 200) return [];

  const filtered = filterSensitiveData(conversation);
  const { signals } = await analyzeTranscript(filtered);
  return signals;
}
```

To:
```js
export async function processSession(transcriptPath) {
  const messages = await parseTranscript(transcriptPath);
  if (messages.length < 4) return { signals: [] };

  const conversation = extractConversation(messages);
  if (conversation.length < 200) return { signals: [] };

  const filtered = filterSensitiveData(conversation);
  const { signals, context } = await analyzeTranscript(filtered);
  return { signals, context };
}
```

**Step 2: Update backfill to handle new return value**

In `src/backfill.js`, update the `backfill` function (lines 84-113). Change the result processing loop:

From:
```js
for (const result of results) {
  if (result.status === 'fulfilled' && result.value.length > 0) {
    allSignals.push(...result.value);
    processed++;
  } else {
    skipped++;
  }
}
```

To:
```js
for (const result of results) {
  if (result.status === 'fulfilled' && result.value.signals.length > 0) {
    allSignals.push(...result.value.signals);
    processed++;
  } else {
    skipped++;
  }
}
```

Note: We're not actually using the context from backfill yet (that would require knowing which project each session belongs to, which is a larger feature). The change is structural — making processSession return the full analysis result so context IS available when we want it later. The key fix is the return type change from bare array to `{ signals, context }`.

**Step 3: Run tests**

Run: `cd /Users/sen/ai/your-taste && npx vitest run tests/backfill.test.js`
Expected: PASS (backfill.test.js only tests `discoverSessions`, not `processSession` directly).

**Step 4: Run full test suite**

Run: `cd /Users/sen/ai/your-taste && npx vitest run`
Expected: ALL tests PASS.

**Step 5: Commit**

```bash
git add src/backfill.js
git commit -m "refactor: processSession returns full analysis result including context"
```

---

## Task 8: Fix Priority Label Naming in User-Prompt

In `src/hooks/user-prompt.js:43-49`, the priority labels are counterintuitive: P2 beats P1 (higher number = higher priority). This should use conventional ordering where lower number = higher priority.

**Files:**
- Modify: `src/hooks/user-prompt.js:43-49`

**Step 1: Rename priority labels**

In `src/hooks/user-prompt.js`, change lines 43-49:

From:
```js
// Priority-based assembly: P2 > P1 > P3 > P4
// P0 (taste.md) is injected by session-start, not here
const prioritized = [
  { text: framework, priority: 'P2', required: true },
  { text: goalText, priority: 'P1', required: true },
  { text: projectCtxText, priority: 'P3', required: false },
  { text: globalCtxText, priority: 'P4', required: false },
].filter(s => s.text);
```

To:
```js
// Priority-based assembly (lower number = higher priority):
// P0: taste.md (injected by session-start, not here)
// P1: thinking framework — core reasoning enhancement
// P2: project goal — stable strategic context
// P3: project context — recent tactical decisions
// P4: global context — cross-project awareness
const prioritized = [
  { text: framework, priority: 'P1', required: true },
  { text: goalText, priority: 'P2', required: true },
  { text: projectCtxText, priority: 'P3', required: false },
  { text: globalCtxText, priority: 'P4', required: false },
].filter(s => s.text);
```

**Step 2: Run tests**

Run: `cd /Users/sen/ai/your-taste && npx vitest run tests/user-prompt.test.js`
Expected: PASS (tests don't assert on priority labels, only on content inclusion).

**Step 3: Run full test suite**

Run: `cd /Users/sen/ai/your-taste && npx vitest run`
Expected: ALL tests PASS.

**Step 4: Commit**

```bash
git add src/hooks/user-prompt.js
git commit -m "fix: use conventional priority numbering (lower = higher priority)"
```

---

## Summary

| Task | Tier | What | Risk |
|------|------|------|------|
| 1 | Must | Remove session_quality gate | Low — gate is purely harmful |
| 2 | Must | Add context validation | Low — additive validation |
| 3 | Must | Rename + restructure prompt | Low — tests mock at parse level |
| 4 | Should | `taste status` command | None — new feature |
| 5 | Should | `taste goal` command | None — new feature |
| 6 | Should | SessionStart result string | Low — display only |
| 7 | Nice | Backfill context preservation | Low — structural change, same behavior |
| 8 | Nice | Priority label naming fix | None — comment/label only |

**Total: 8 tasks, 8 commits. Estimated: ~45 minutes execution time.**

After all tasks complete, run: `cd /Users/sen/ai/your-taste && npx vitest run` to verify full suite passes.
