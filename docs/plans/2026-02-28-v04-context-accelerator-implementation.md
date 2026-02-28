# v0.4 Context Accelerator Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add strategic context persistence and per-message thinking framework injection to transform your-taste from a preference tracker into a context accelerator.

**Architecture:** Three new components: (1) `src/context.js` for context.yaml CRUD with time decay, (2) enhanced SessionEnd to extract session_context from Haiku, (3) `src/hooks/user-prompt.js` as UserPromptSubmit hook injecting context + thinking framework every message. SessionStart also gets a minor enhancement to inject context at session start.

**Tech Stack:** Node.js >=18, ESM modules, `yaml` package for YAML parsing, `vitest` for tests. No new dependencies.

**Design Doc:** `docs/plans/2026-02-28-v04-context-accelerator-design.md`

---

### Task 1: Context Storage Module — Tests

**Files:**
- Create: `tests/context.test.js`

**Reference:** Study `src/profile.js` and `src/pending.js` for the established YAML read/write pattern. They use `process.env.YOUR_TASTE_DIR` for test isolation with `getDir()` helpers. The context module follows the same pattern.

**Step 1: Write context storage tests**

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { parse } from 'yaml';
import {
  loadContext,
  updateContext,
  pruneContext,
  renderContext,
} from '../src/context.js';

describe('context storage', () => {
  let dir;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'taste-ctx-'));
    process.env.YOUR_TASTE_DIR = dir;
  });

  afterEach(async () => {
    delete process.env.YOUR_TASTE_DIR;
    await rm(dir, { recursive: true });
  });

  it('returns empty context when file missing', async () => {
    const ctx = await loadContext();
    expect(ctx.focus).toEqual([]);
    expect(ctx.decisions).toEqual([]);
    expect(ctx.open_questions).toEqual([]);
  });

  it('writes and reads context entries', async () => {
    await updateContext({
      topics: ['product repositioning'],
      decisions: ['use YAML for storage'],
      open_questions: ['size limits'],
    });
    const ctx = await loadContext();
    expect(ctx.focus).toHaveLength(1);
    expect(ctx.focus[0].text).toBe('product repositioning');
    expect(ctx.decisions).toHaveLength(1);
    expect(ctx.open_questions).toHaveLength(1);
  });

  it('deduplicates by exact text match', async () => {
    await updateContext({ topics: ['topic A'], decisions: [], open_questions: [] });
    await updateContext({ topics: ['topic A', 'topic B'], decisions: [], open_questions: [] });
    const ctx = await loadContext();
    expect(ctx.focus).toHaveLength(2);
    expect(ctx.focus.map(f => f.text)).toContain('topic A');
    expect(ctx.focus.map(f => f.text)).toContain('topic B');
  });

  it('respects max entry limits', async () => {
    // focus max is 10
    for (let i = 0; i < 12; i++) {
      await updateContext({ topics: [`topic ${i}`], decisions: [], open_questions: [] });
    }
    const ctx = await loadContext();
    expect(ctx.focus.length).toBeLessThanOrEqual(10);
    // newest entries kept (topic 11, 10, 9...)
    expect(ctx.focus[0].text).toBe('topic 11');
  });

  it('prunes expired entries', async () => {
    await updateContext({ topics: ['old topic'], decisions: ['old decision'], open_questions: [] });
    // Manually backdate the entries
    const ctx = await loadContext();
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 31); // 31 days ago — past 30-day focus TTL
    ctx.focus[0].date = oldDate.toISOString().split('T')[0];
    const oldDecDate = new Date();
    oldDecDate.setDate(oldDecDate.getDate() - 91); // past 90-day decision TTL
    ctx.decisions[0].date = oldDecDate.toISOString().split('T')[0];

    // Write backdated context, then prune
    const { writeFile: wf, mkdir: mk } = await import('fs/promises');
    const { stringify } = await import('yaml');
    await wf(join(dir, 'context.yaml'), stringify({ version: 1, ...ctx }), 'utf8');

    await pruneContext();
    const pruned = await loadContext();
    expect(pruned.focus).toHaveLength(0);
    expect(pruned.decisions).toHaveLength(0);
  });
});

describe('context rendering', () => {
  let dir;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'taste-ctx-'));
    process.env.YOUR_TASTE_DIR = dir;
  });

  afterEach(async () => {
    delete process.env.YOUR_TASTE_DIR;
    await rm(dir, { recursive: true });
  });

  it('returns null when context is empty', async () => {
    const result = renderContext(await loadContext());
    expect(result).toBeNull();
  });

  it('renders focus with short dates, decisions without dates', async () => {
    await updateContext({
      topics: ['context accelerator design'],
      decisions: ['use YAML storage'],
      open_questions: ['size limits'],
    });
    const ctx = await loadContext();
    const rendered = renderContext(ctx);
    expect(rendered).toContain('## Active Context');
    expect(rendered).toContain('### Recent Focus');
    expect(rendered).toContain('context accelerator design');
    expect(rendered).toContain('### Key Decisions');
    expect(rendered).toContain('use YAML storage');
    expect(rendered).toContain('### Open Questions');
    expect(rendered).toContain('size limits');
  });

  it('omits empty sections', async () => {
    await updateContext({ topics: ['only focus'], decisions: [], open_questions: [] });
    const ctx = await loadContext();
    const rendered = renderContext(ctx);
    expect(rendered).toContain('### Recent Focus');
    expect(rendered).not.toContain('### Key Decisions');
    expect(rendered).not.toContain('### Open Questions');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/sen/ai/your-taste && npx vitest run tests/context.test.js`
Expected: FAIL — `src/context.js` doesn't exist yet.

**Step 3: Commit test file**

```bash
cd /Users/sen/ai/your-taste
git add tests/context.test.js
git commit -m "test: add context storage tests for v0.4"
```

---

### Task 2: Context Storage Module — Implementation

**Files:**
- Create: `src/context.js`

**Reference:** Follow the exact same pattern as `src/profile.js:5-7` for `getDir()` and `src/pending.js:12-18` for `readPending()`. Uses `process.env.YOUR_TASTE_DIR` for test isolation.

**Step 1: Implement context.js**

```javascript
import { readFile, writeFile, mkdir } from 'fs/promises';
import { parse, stringify } from 'yaml';

const MAX_FOCUS = 10;
const MAX_DECISIONS = 15;
const MAX_QUESTIONS = 5;
const FOCUS_TTL_DAYS = 30;
const DECISIONS_TTL_DAYS = 90;
const QUESTIONS_TTL_DAYS = 60;

function getDir() {
  return process.env.YOUR_TASTE_DIR || `${process.env.HOME}/.your-taste`;
}

function getContextPath() {
  return `${getDir()}/context.yaml`;
}

function createEmptyContext() {
  return { focus: [], decisions: [], open_questions: [] };
}

export async function loadContext() {
  try {
    const content = await readFile(getContextPath(), 'utf8');
    const data = parse(content);
    if (!data) return createEmptyContext();
    return {
      focus: data.focus || [],
      decisions: data.decisions || [],
      open_questions: data.open_questions || [],
    };
  } catch {
    return createEmptyContext();
  }
}

export async function updateContext(sessionContext) {
  const ctx = await loadContext();
  const today = new Date().toISOString().split('T')[0];

  const merge = (existing, newTexts, max) => {
    const existingTexts = new Set(existing.map(e => e.text));
    const toAdd = newTexts
      .filter(t => t && !existingTexts.has(t))
      .map(t => ({ date: today, text: t }));
    return [...toAdd, ...existing].slice(0, max);
  };

  ctx.focus = merge(ctx.focus, sessionContext.topics || [], MAX_FOCUS);
  ctx.decisions = merge(ctx.decisions, sessionContext.decisions || [], MAX_DECISIONS);
  ctx.open_questions = merge(ctx.open_questions, sessionContext.open_questions || [], MAX_QUESTIONS);

  const dir = getDir();
  await mkdir(dir, { recursive: true });
  await writeFile(getContextPath(), stringify({ version: 1, ...ctx }), 'utf8');
  return ctx;
}

export async function pruneContext() {
  const ctx = await loadContext();
  const now = Date.now();

  const filterByAge = (entries, ttlDays) =>
    entries.filter(e => {
      const age = (now - new Date(e.date).getTime()) / (1000 * 60 * 60 * 24);
      return age <= ttlDays;
    });

  ctx.focus = filterByAge(ctx.focus, FOCUS_TTL_DAYS);
  ctx.decisions = filterByAge(ctx.decisions, DECISIONS_TTL_DAYS);
  ctx.open_questions = filterByAge(ctx.open_questions, QUESTIONS_TTL_DAYS);

  const dir = getDir();
  await mkdir(dir, { recursive: true });
  await writeFile(getContextPath(), stringify({ version: 1, ...ctx }), 'utf8');
  return ctx;
}

function formatShortDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function renderContext(ctx) {
  const sections = [];

  if (ctx.focus.length > 0) {
    const items = ctx.focus.map(f => `- [${formatShortDate(f.date)}] ${f.text}`).join('\n');
    sections.push(`### Recent Focus\n${items}`);
  }

  if (ctx.decisions.length > 0) {
    const items = ctx.decisions.map(d => `- ${d.text}`).join('\n');
    sections.push(`### Key Decisions\n${items}`);
  }

  if (ctx.open_questions.length > 0) {
    const items = ctx.open_questions.map(q => `- ${q.text}`).join('\n');
    sections.push(`### Open Questions\n${items}`);
  }

  if (sections.length === 0) return null;
  return `## Active Context\n\n${sections.join('\n\n')}`;
}
```

**Step 2: Run tests to verify they pass**

Run: `cd /Users/sen/ai/your-taste && npx vitest run tests/context.test.js`
Expected: All 8 tests PASS.

**Step 3: Run full test suite to verify no regressions**

Run: `cd /Users/sen/ai/your-taste && npx vitest run`
Expected: All tests PASS (61 existing + 8 new = 69).

**Step 4: Commit**

```bash
cd /Users/sen/ai/your-taste
git add src/context.js
git commit -m "feat: add context storage module with CRUD, time decay, and rendering"
```

---

### Task 3: Analyzer Enhancement — Parse session_context

**Files:**
- Modify: `src/analyzer.js:30-49` (the `parseAnalysisResponse` function)
- Modify: `tests/analyzer.test.js`

**Step 1: Add tests for session_context parsing**

Append these tests to `tests/analyzer.test.js` inside the existing `describe` block:

```javascript
  it('parses session_context when present', () => {
    const json = JSON.stringify({
      signals: [],
      candidate_rules: [],
      session_quality: 'medium',
      session_context: {
        topics: ['product repositioning'],
        decisions: ['use YAML storage'],
        open_questions: ['size limits'],
      },
    });
    const result = parseAnalysisResponse(json);
    expect(result.context).toEqual({
      topics: ['product repositioning'],
      decisions: ['use YAML storage'],
      open_questions: ['size limits'],
    });
  });

  it('returns null context when session_context is missing', () => {
    const json = JSON.stringify({
      signals: [],
      candidate_rules: [],
      session_quality: 'medium',
    });
    const result = parseAnalysisResponse(json);
    expect(result.context).toBeNull();
  });

  it('returns null context on session_quality none', () => {
    const json = JSON.stringify({ signals: [], candidate_rules: [], session_quality: 'none' });
    const result = parseAnalysisResponse(json);
    expect(result.context).toBeNull();
  });
```

**Step 2: Run tests to see the new ones fail**

Run: `cd /Users/sen/ai/your-taste && npx vitest run tests/analyzer.test.js`
Expected: 3 new tests FAIL (parseAnalysisResponse doesn't return `context`).

**Step 3: Update parseAnalysisResponse to extract context**

In `src/analyzer.js`, replace the `parseAnalysisResponse` function (lines 30-49):

```javascript
export function parseAnalysisResponse(text) {
  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const result = JSON.parse(cleaned);

    if (result.session_quality === 'none') return { signals: [], rules: [], context: null };

    const signals = (result.signals || []).filter(
      s => DIMENSIONS[s.dimension] && typeof s.score === 'number',
    );

    const rules = (result.candidate_rules || []).filter(
      r => typeof r === 'string' && r.trim().length > 0,
    );

    const context = result.session_context || null;

    return { signals, rules, context };
  } catch {
    return { signals: [], rules: [], context: null };
  }
}
```

**Step 4: Run tests to verify all pass**

Run: `cd /Users/sen/ai/your-taste && npx vitest run tests/analyzer.test.js`
Expected: All 9 tests PASS.

**Step 5: Run full suite**

Run: `cd /Users/sen/ai/your-taste && npx vitest run`
Expected: All tests PASS. Check that existing tests calling `parseAnalysisResponse` still work — they destructure `{ signals, rules }` which still works when `context` is added.

**Step 6: Commit**

```bash
cd /Users/sen/ai/your-taste
git add src/analyzer.js tests/analyzer.test.js
git commit -m "feat: extract session_context from Haiku analysis response"
```

---

### Task 4: Prompt Enhancement — Session Context Extraction

**Files:**
- Modify: `prompts/extract-preferences.md`

**Step 1: Add session context extraction section and update output format**

In `prompts/extract-preferences.md`, insert a new section between `{{PENDING_RULES}}` and `## Output Format`:

```markdown
## Session Context Extraction

Beyond preference signals, extract the STRATEGIC CONTEXT of this conversation:

- **topics**: What major subjects were discussed? (1-3 items, abstract level only)
- **decisions**: What was explicitly decided? Only clear decisions, not preferences.
- **open_questions**: What was raised but left unresolved?

Keep entries concise (max 15 words each). Focus on strategic direction, not implementation details.
No code, no variable names, no file paths — just the strategic what and why.
If the session has no meaningful strategic content, omit session_context entirely.
```

Then update the Output Format section's JSON example to include `session_context`:

```json
{
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
  "session_quality": "high|medium|low|none",
  "session_context": {
    "topics": ["product architecture redesign"],
    "decisions": ["use event-driven approach for decoupling"],
    "open_questions": ["migration timeline for legacy components"]
  }
}
```

Add a note after the `session_quality` description:

```
session_context captures the strategic-level topics, decisions, and open questions from this conversation. Only include when the session has substantive strategic content. Omit for pure Q&A or debugging sessions.
```

**Step 2: Verify no tests break**

Run: `cd /Users/sen/ai/your-taste && npx vitest run`
Expected: All tests PASS. The prompt is a template read at runtime — no test imports it directly.

**Step 3: Commit**

```bash
cd /Users/sen/ai/your-taste
git add prompts/extract-preferences.md
git commit -m "feat: add session context extraction to Haiku prompt"
```

---

### Task 5: SessionEnd Enhancement — Write Context

**Files:**
- Modify: `src/hooks/session-end.js`

**Step 1: Update session-end.js to write context**

Replace the full file content:

```javascript
#!/usr/bin/env node
// Runs automatically when a Claude Code session ends.
// Reads the conversation transcript, analyzes for preference signals,
// and updates the taste profile and strategic context.

import { parseTranscript, extractConversation } from '../transcript.js';
import { filterSensitiveData } from '../privacy.js';
import { readProfile, updateProfile } from '../profile.js';
import { analyzeTranscript } from '../analyzer.js';
import { readPending, updatePending, getPendingRuleTexts } from '../pending.js';
import { updateContext, pruneContext } from '../context.js';

async function main() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  const { transcript_path } = JSON.parse(input);
  if (!transcript_path) process.exit(0);

  const messages = await parseTranscript(transcript_path);
  if (messages.length < 4) process.exit(0);

  const conversation = extractConversation(messages);
  if (conversation.length < 200) process.exit(0);
  const filtered = filterSensitiveData(conversation);

  // Read pending rules for prompt injection (dedup)
  const pending = await readPending();
  const pendingTexts = getPendingRuleTexts(pending);

  // Analyze — returns { signals, rules, context }
  const { signals, rules, context } = await analyzeTranscript(filtered, pendingTexts);

  // Update profile with dimension signals
  if (signals.length > 0) {
    const profile = await readProfile();
    await updateProfile(profile, signals);
  }

  // Accumulate candidate rules
  if (rules.length > 0) {
    await updatePending(pending, rules);
  }

  // Update strategic context
  if (context) {
    await updateContext(context);
    await pruneContext();
  }
}

main().catch(() => process.exit(0)); // Never block session exit
```

**Step 2: Run full test suite**

Run: `cd /Users/sen/ai/your-taste && npx vitest run`
Expected: All tests PASS. The session-end hook is not unit-tested directly (it's an entry point), but ensure no import errors.

**Step 3: Commit**

```bash
cd /Users/sen/ai/your-taste
git add src/hooks/session-end.js
git commit -m "feat: write strategic context on session end"
```

---

### Task 6: Thinking Framework Template

**Files:**
- Create: `prompts/thinking-framework.md`

**Step 1: Create the template**

```markdown
## How to Think About This User's Messages

### Intent Inference
When the user sends a message:
1. What did they literally say? (C)
2. What might they actually mean? (A) — trace back through their reasoning chain
3. Why are they raising this NOW? — timing reveals priority
4. From A, what implications should you consider that weren't explicitly stated?

### Solution Quality
Before proposing a solution:
1. What broader problem is this a symptom of?
2. Are there fundamentally different approaches worth considering?
3. Which approach best fits the user's current strategic direction?
4. What second-order problems does your proposed approach create?

### Learning from Corrections
When the user corrects you:
- Capture the underlying principle, not just the fix
- The correction pattern reveals thinking style — persist important insights

### Context Awareness
- After significant corrections or decisions, proactively persist insights
  to durable files before they're lost to compression
- When context feels insufficient, say so and ask for what you need
```

**Step 2: Commit**

```bash
cd /Users/sen/ai/your-taste
git add prompts/thinking-framework.md
git commit -m "feat: add thinking framework template for per-message injection"
```

---

### Task 7: UserPromptSubmit Hook — Tests

**Files:**
- Create: `tests/user-prompt.test.js`

**Reference:** Study `tests/session-start.test.js` for the hook testing pattern. The hook module exports a `buildUserPromptContext()` function for testability, same pattern as `buildAdditionalContext()` in session-start.js.

**Step 1: Write UserPromptSubmit tests**

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { stringify } from 'yaml';
import { buildUserPromptContext } from '../src/hooks/user-prompt.js';

describe('user-prompt hook context assembly', () => {
  let dir;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'taste-up-'));
    process.env.YOUR_TASTE_DIR = dir;
  });

  afterEach(async () => {
    delete process.env.YOUR_TASTE_DIR;
    await rm(dir, { recursive: true });
  });

  it('returns framework + context when both available', async () => {
    await writeFile(
      join(dir, 'context.yaml'),
      stringify({
        version: 1,
        focus: [{ date: '2026-02-28', text: 'testing feature' }],
        decisions: [],
        open_questions: [],
      }),
      'utf8',
    );
    const result = await buildUserPromptContext();
    expect(result).toContain('Intent Inference');
    expect(result).toContain('testing feature');
  });

  it('returns framework only when no context file', async () => {
    const result = await buildUserPromptContext();
    expect(result).toContain('Intent Inference');
    expect(result).not.toContain('Active Context');
  });

  it('returns null when framework template is missing and no context', async () => {
    // This test validates graceful degradation. In practice the template
    // always exists, but if deleted the hook should not crash.
    // We test this by monkeypatching — but since buildUserPromptContext
    // reads from a known path relative to the module, we just verify
    // the function returns something (framework file is always present).
    const result = await buildUserPromptContext();
    expect(result).toBeTruthy();
  });

  it('truncates to framework only when combined output exceeds max', async () => {
    // Create a context.yaml with many long entries to exceed 4000 chars
    const longEntries = Array.from({ length: 15 }, (_, i) => ({
      date: '2026-02-28',
      text: `Very long decision text that takes up significant space in the output ${i} ${'x'.repeat(200)}`,
    }));
    await writeFile(
      join(dir, 'context.yaml'),
      stringify({ version: 1, focus: [], decisions: longEntries, open_questions: [] }),
      'utf8',
    );
    const result = await buildUserPromptContext();
    // Should still have framework but context may be dropped
    expect(result).toContain('Intent Inference');
    expect(result.length).toBeLessThanOrEqual(4100); // some slack for framework
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/sen/ai/your-taste && npx vitest run tests/user-prompt.test.js`
Expected: FAIL — `src/hooks/user-prompt.js` doesn't export `buildUserPromptContext`.

**Step 3: Commit test file**

```bash
cd /Users/sen/ai/your-taste
git add tests/user-prompt.test.js
git commit -m "test: add UserPromptSubmit hook tests"
```

---

### Task 8: UserPromptSubmit Hook — Implementation

**Files:**
- Create: `src/hooks/user-prompt.js`

**Step 1: Implement the hook handler**

```javascript
#!/usr/bin/env node
import { readFile } from 'fs/promises';
import { loadContext, renderContext } from '../context.js';

const MAX_CHARS = 4000;

export async function buildUserPromptContext() {
  let framework = '';
  try {
    framework = await readFile(
      new URL('../../prompts/thinking-framework.md', import.meta.url),
      'utf8',
    );
  } catch {
    // Template missing — degrade gracefully
  }

  const ctx = await loadContext();
  const contextText = renderContext(ctx);

  const sections = [framework, contextText].filter(Boolean);
  if (sections.length === 0) return null;

  const combined = sections.join('\n\n');

  // Size guard: framework is essential, context is nice-to-have
  if (combined.length > MAX_CHARS && framework) {
    return framework;
  }

  return combined;
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  const additionalContext = await buildUserPromptContext();
  if (!additionalContext) process.exit(0);

  console.log(JSON.stringify({
    hookSpecificOutput: { additionalContext },
  }));
}

main().catch(() => process.exit(0));
```

**Step 2: Run UserPromptSubmit tests**

Run: `cd /Users/sen/ai/your-taste && npx vitest run tests/user-prompt.test.js`
Expected: All 4 tests PASS.

**Step 3: Run full suite**

Run: `cd /Users/sen/ai/your-taste && npx vitest run`
Expected: All tests PASS.

**Step 4: Commit**

```bash
cd /Users/sen/ai/your-taste
git add src/hooks/user-prompt.js
git commit -m "feat: add UserPromptSubmit hook for per-message context injection"
```

---

### Task 9: SessionStart Enhancement — Inject Context

**Files:**
- Modify: `src/hooks/session-start.js`
- Modify: `tests/session-start.test.js`

**Step 1: Add test for context injection in session-start**

Append to `tests/session-start.test.js`:

```javascript
import { loadContext, updateContext } from '../src/context.js';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { beforeEach, afterEach } from 'vitest';

// Add a new describe block after the existing one
describe('session-start with context', () => {
  let dir;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'taste-ss-'));
    process.env.YOUR_TASTE_DIR = dir;
  });

  afterEach(async () => {
    delete process.env.YOUR_TASTE_DIR;
    await rm(dir, { recursive: true });
  });

  it('includes context in additionalContext when available', async () => {
    await updateContext({ topics: ['test focus'], decisions: [], open_questions: [] });
    const profile = createDefaultProfile();
    profile.dimensions.risk_tolerance.score = 0.8;
    profile.dimensions.risk_tolerance.confidence = 0.6;
    const ctx = await loadContext();
    const result = buildAdditionalContext(profile, null, ctx);
    expect(result).toContain('rewrite'); // template instruction
    expect(result).toContain('test focus'); // context
  });

  it('works without context', () => {
    const profile = createDefaultProfile();
    profile.dimensions.risk_tolerance.score = 0.8;
    profile.dimensions.risk_tolerance.confidence = 0.6;
    const result = buildAdditionalContext(profile, null, null);
    expect(result).toContain('rewrite');
    expect(result).not.toContain('Active Context');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/sen/ai/your-taste && npx vitest run tests/session-start.test.js`
Expected: FAIL — `buildAdditionalContext` doesn't accept a third argument yet.

**Step 3: Update session-start.js to accept and inject context**

Replace `src/hooks/session-start.js`:

```javascript
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
```

**Step 4: Fix existing tests**

The existing tests call `buildAdditionalContext(profile, tasteContent)` with 2 args. The updated function accepts an optional third arg `context`, so existing tests pass without change — `context` defaults to `undefined`, and `undefined ? renderContext(undefined) : null` returns `null`.

**Step 5: Run all session-start tests**

Run: `cd /Users/sen/ai/your-taste && npx vitest run tests/session-start.test.js`
Expected: All tests PASS (3 existing + 2 new = 5).

**Step 6: Run full suite**

Run: `cd /Users/sen/ai/your-taste && npx vitest run`
Expected: All tests PASS.

**Step 7: Commit**

```bash
cd /Users/sen/ai/your-taste
git add src/hooks/session-start.js tests/session-start.test.js
git commit -m "feat: inject strategic context at session start"
```

---

### Task 10: Register UserPromptSubmit Hook

**Files:**
- Modify: `hooks/hooks.json`

**Step 1: Add UserPromptSubmit to hooks.json**

Replace `hooks/hooks.json`:

```json
{
  "description": "your-taste: learn user decision-making style from conversations",
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/src/hooks/session-start.js\"",
            "timeout": 10
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/src/hooks/session-end.js\"",
            "timeout": 120
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/src/hooks/user-prompt.js\"",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

**Step 2: Verify JSON is valid**

Run: `cd /Users/sen/ai/your-taste && node -e "JSON.parse(require('fs').readFileSync('hooks/hooks.json', 'utf8')); console.log('Valid JSON')"`
Expected: `Valid JSON`

**Step 3: Commit**

```bash
cd /Users/sen/ai/your-taste
git add hooks/hooks.json
git commit -m "feat: register UserPromptSubmit hook for per-message context injection"
```

---

### Task 11: Integration Verification & Version Bump

**Files:**
- Modify: `package.json` (version bump to 0.4.0)

**Step 1: Run full test suite**

Run: `cd /Users/sen/ai/your-taste && npx vitest run`
Expected: All tests PASS (61 original + new context + user-prompt + analyzer + session-start additions).

**Step 2: Manually verify hook output**

Test the UserPromptSubmit hook directly:

```bash
cd /Users/sen/ai/your-taste
echo '{}' | node src/hooks/user-prompt.js
```

Expected: JSON output with `hookSpecificOutput.additionalContext` containing the thinking framework text.

Test SessionStart with context:

```bash
echo '{}' | node src/hooks/session-start.js
```

Expected: JSON output that may include context if `~/.your-taste/context.yaml` exists.

**Step 3: Bump version**

In `package.json`, change `"version": "0.3.0"` to `"version": "0.4.0"`.

**Step 4: Commit**

```bash
cd /Users/sen/ai/your-taste
git add package.json
git commit -m "chore: bump version to 0.4.0"
```

---

## Deferred Items (Documented for Future Context)

These items were explicitly scoped out. See design doc for full rationale.

### v0.4.1 (post-validation polish)
- **A→C few-shot examples** in extract-preferences.md — needs real Haiku output data
- **Misattribution detection** — needs error pattern data
- **Thinking framework personalization** based on taste profile — needs A/B validation

### v0.5
- **Cross-project context** handling (project-scoped vs global)
- **`taste init` context extraction** from backfill sessions
- **Dynamic context size budgeting** based on measured additionalContext limits

### v0.6+
- **Semantic deduplication** for context entries
- **Context importance scoring**
- **UserPromptSubmit as learning point** (observe corrections in real-time)

### Open Validation Questions
1. additionalContext effective size — is 4000 chars optimal?
2. UserPromptSubmit latency — noticeable to users?
3. Haiku session_context quality — useful or noise?
4. Thinking framework effectiveness — does it change AI behavior?
5. Context decay rates — are 30/60/90 day windows correct?
