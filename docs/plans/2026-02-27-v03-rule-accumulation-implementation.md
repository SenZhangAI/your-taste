# v0.3 Rule Accumulation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Graduate from template instructions to real accumulated behavioral rules — extract candidate rules from sessions, accumulate in pending.yaml, let users review and approve, generate taste.md as primary AI instruction source.

**Architecture:** Extend the existing SessionEnd Haiku prompt to also output candidate behavioral rules. Rules accumulate silently in pending.yaml with occurrence counting. When rules reach 3 occurrences, `/your-taste:review` skill surfaces them for user approval. Approved rules are written to taste.md, which replaces template rendering as the primary instruction source at SessionStart.

**Tech Stack:** Node.js ESM, vitest, Anthropic SDK (Haiku), YAML

---

### Task 1: pending.js — Tests + Implementation

**Files:**
- Create: `src/pending.js`
- Create: `tests/pending.test.js`

**Step 1: Write the tests**

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'fs/promises';
import { readPending, updatePending, removePendingRules, getPendingRuleTexts } from '../src/pending.js';

const TEST_DIR = '/tmp/your-taste-test-pending';

describe('pending rules', () => {
  beforeEach(async () => {
    process.env.YOUR_TASTE_DIR = TEST_DIR;
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
    delete process.env.YOUR_TASTE_DIR;
  });

  it('returns empty rules for missing file', async () => {
    const pending = await readPending();
    expect(pending.rules).toEqual([]);
  });

  it('adds new rules with count 1', async () => {
    const pending = await readPending();
    const updated = await updatePending(pending, ['Rule A', 'Rule B']);
    expect(updated.rules).toHaveLength(2);
    expect(updated.rules[0].text).toBe('Rule A');
    expect(updated.rules[0].count).toBe(1);
    expect(updated.rules[0].first_seen).toBeDefined();
  });

  it('increments count for exact text match', async () => {
    let pending = await readPending();
    pending = await updatePending(pending, ['Rule A']);
    pending = await readPending(); // re-read from disk
    pending = await updatePending(pending, ['Rule A']);
    pending = await readPending();
    expect(pending.rules).toHaveLength(1);
    expect(pending.rules[0].count).toBe(2);
  });

  it('handles mix of new and existing rules', async () => {
    let pending = await readPending();
    pending = await updatePending(pending, ['Rule A']);
    pending = await readPending();
    pending = await updatePending(pending, ['Rule A', 'Rule B']);
    pending = await readPending();
    expect(pending.rules).toHaveLength(2);
    expect(pending.rules.find(r => r.text === 'Rule A').count).toBe(2);
    expect(pending.rules.find(r => r.text === 'Rule B').count).toBe(1);
  });

  it('removes rules by text', async () => {
    let pending = await readPending();
    pending = await updatePending(pending, ['Rule A', 'Rule B', 'Rule C']);
    pending = await readPending();
    pending = await removePendingRules(pending, ['Rule A', 'Rule C']);
    pending = await readPending();
    expect(pending.rules).toHaveLength(1);
    expect(pending.rules[0].text).toBe('Rule B');
  });

  it('getPendingRuleTexts returns array of texts', async () => {
    let pending = await readPending();
    pending = await updatePending(pending, ['Rule A', 'Rule B']);
    pending = await readPending();
    const texts = getPendingRuleTexts(pending);
    expect(texts).toEqual(['Rule A', 'Rule B']);
  });
});
```

**Step 2: Implement pending.js**

```js
import { readFile, writeFile, mkdir } from 'fs/promises';
import { parse, stringify } from 'yaml';

function getDir() {
  return process.env.YOUR_TASTE_DIR || `${process.env.HOME}/.your-taste`;
}

function getPendingPath() {
  return `${getDir()}/pending.yaml`;
}

export async function readPending() {
  try {
    const content = await readFile(getPendingPath(), 'utf8');
    return parse(content) || { rules: [] };
  } catch {
    return { rules: [] };
  }
}

export async function updatePending(pending, newRuleTexts) {
  const today = new Date().toISOString().split('T')[0];

  for (const text of newRuleTexts) {
    const existing = pending.rules.find(r => r.text === text);
    if (existing) {
      existing.count++;
      existing.last_seen = today;
    } else {
      pending.rules.push({ text, count: 1, first_seen: today, last_seen: today });
    }
  }

  const dir = getDir();
  await mkdir(dir, { recursive: true });
  await writeFile(getPendingPath(), stringify(pending), 'utf8');
  return pending;
}

export async function removePendingRules(pending, textsToRemove) {
  pending.rules = pending.rules.filter(r => !textsToRemove.includes(r.text));

  const dir = getDir();
  await mkdir(dir, { recursive: true });
  await writeFile(getPendingPath(), stringify(pending), 'utf8');
  return pending;
}

export function getPendingRuleTexts(pending) {
  return pending.rules.map(r => r.text);
}
```

**Step 3: Run tests**

Run: `cd /Users/sen/ai/your-taste && npx vitest run tests/pending.test.js`
Expected: All 6 tests PASS

**Step 4: Run full suite**

Run: `cd /Users/sen/ai/your-taste && npx vitest run`
Expected: All tests PASS

**Step 5: Commit**

```bash
cd /Users/sen/ai/your-taste
git add src/pending.js tests/pending.test.js
git commit -m "feat: pending.yaml rule accumulation with dedup and removal"
```

---

### Task 2: taste-file.js — Tests + Implementation

**Files:**
- Create: `src/taste-file.js`
- Create: `tests/taste-file.test.js`

**Step 1: Write the tests**

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'fs/promises';
import { readTasteFile, appendRules } from '../src/taste-file.js';

const TEST_DIR = '/tmp/your-taste-test-tastefile';

describe('taste file', () => {
  beforeEach(async () => {
    process.env.YOUR_TASTE_DIR = TEST_DIR;
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
    delete process.env.YOUR_TASTE_DIR;
  });

  it('returns null for missing taste.md', async () => {
    expect(await readTasteFile()).toBeNull();
  });

  it('returns null for empty taste.md', async () => {
    await writeFile(`${TEST_DIR}/taste.md`, '', 'utf8');
    expect(await readTasteFile()).toBeNull();
  });

  it('reads existing taste.md content', async () => {
    await writeFile(`${TEST_DIR}/taste.md`, '# Your Taste\n\n- Rule A\n', 'utf8');
    const content = await readTasteFile();
    expect(content).toContain('Rule A');
  });

  it('creates taste.md with header when appending to nonexistent file', async () => {
    await appendRules(['Rule A', 'Rule B']);
    const content = await readTasteFile();
    expect(content).toContain('# Your Taste');
    expect(content).toContain('- Rule A');
    expect(content).toContain('- Rule B');
  });

  it('appends rules to existing taste.md', async () => {
    await writeFile(`${TEST_DIR}/taste.md`, '# Your Taste\n\n- Existing rule\n', 'utf8');
    await appendRules(['New rule']);
    const content = await readTasteFile();
    expect(content).toContain('- Existing rule');
    expect(content).toContain('- New rule');
  });

  it('does not duplicate rules already in taste.md', async () => {
    await writeFile(`${TEST_DIR}/taste.md`, '# Your Taste\n\n- Rule A\n', 'utf8');
    await appendRules(['Rule A', 'Rule B']);
    const content = await readTasteFile();
    const matches = content.match(/Rule A/g);
    expect(matches).toHaveLength(1);
    expect(content).toContain('- Rule B');
  });
});
```

**Step 2: Implement taste-file.js**

```js
import { readFile, writeFile, mkdir } from 'fs/promises';

function getDir() {
  return process.env.YOUR_TASTE_DIR || `${process.env.HOME}/.your-taste`;
}

export function getTasteFilePath() {
  return `${getDir()}/taste.md`;
}

export async function readTasteFile() {
  try {
    const content = await readFile(getTasteFilePath(), 'utf8');
    return content.trim() || null;
  } catch {
    return null;
  }
}

export async function appendRules(rules) {
  const dir = getDir();
  await mkdir(dir, { recursive: true });

  let content = await readTasteFile();

  if (!content) {
    content = '# Your Taste\n';
  }

  const existingRules = content.match(/^- .+$/gm) || [];
  const existingTexts = existingRules.map(r => r.slice(2));

  const newRules = rules.filter(r => !existingTexts.includes(r));
  if (newRules.length === 0) return;

  const additions = newRules.map(r => `- ${r}`).join('\n');
  content = content.trimEnd() + '\n' + additions + '\n';

  await writeFile(getTasteFilePath(), content, 'utf8');
}
```

**Step 3: Run tests**

Run: `cd /Users/sen/ai/your-taste && npx vitest run tests/taste-file.test.js`
Expected: All 6 tests PASS

**Step 4: Run full suite**

Run: `cd /Users/sen/ai/your-taste && npx vitest run`
Expected: All tests PASS

**Step 5: Commit**

```bash
cd /Users/sen/ai/your-taste
git add src/taste-file.js tests/taste-file.test.js
git commit -m "feat: taste.md read/write/append with dedup"
```

---

### Task 3: Extend Haiku Prompt + Analyzer

**Files:**
- Modify: `prompts/extract-preferences.md`
- Modify: `src/analyzer.js`
- Create: `tests/analyzer.test.js`

**Step 1: Write tests for the new analyzer behavior**

```js
import { describe, it, expect } from 'vitest';
import { parseAnalysisResponse } from '../src/analyzer.js';

describe('analyzer response parsing', () => {
  it('parses signals and candidate_rules from response', () => {
    const json = JSON.stringify({
      signals: [
        { dimension: 'risk_tolerance', score: 0.8, direction: 'bold', evidence: 'test', summary: 'test' }
      ],
      candidate_rules: ['Clean breaks over gradual migration'],
      session_quality: 'high',
    });
    const result = parseAnalysisResponse(json);
    expect(result.signals).toHaveLength(1);
    expect(result.rules).toEqual(['Clean breaks over gradual migration']);
  });

  it('returns empty rules when candidate_rules is missing', () => {
    const json = JSON.stringify({
      signals: [
        { dimension: 'risk_tolerance', score: 0.8, direction: 'bold', evidence: 'test', summary: 'test' }
      ],
      session_quality: 'medium',
    });
    const result = parseAnalysisResponse(json);
    expect(result.signals).toHaveLength(1);
    expect(result.rules).toEqual([]);
  });

  it('returns empty for session_quality none', () => {
    const json = JSON.stringify({ signals: [], candidate_rules: [], session_quality: 'none' });
    const result = parseAnalysisResponse(json);
    expect(result.signals).toEqual([]);
    expect(result.rules).toEqual([]);
  });

  it('handles malformed JSON gracefully', () => {
    const result = parseAnalysisResponse('not json at all');
    expect(result.signals).toEqual([]);
    expect(result.rules).toEqual([]);
  });

  it('filters invalid signals', () => {
    const json = JSON.stringify({
      signals: [
        { dimension: 'risk_tolerance', score: 0.8, direction: 'bold', evidence: 'test', summary: 'test' },
        { dimension: 'nonexistent', score: 0.5, direction: 'x', evidence: 'x', summary: 'x' },
        { dimension: 'risk_tolerance', evidence: 'no score' },
      ],
      candidate_rules: [],
      session_quality: 'medium',
    });
    const result = parseAnalysisResponse(json);
    expect(result.signals).toHaveLength(1);
  });

  it('filters non-string rules', () => {
    const json = JSON.stringify({
      signals: [],
      candidate_rules: ['Valid rule', 123, null, '', 'Another valid'],
      session_quality: 'medium',
    });
    const result = parseAnalysisResponse(json);
    expect(result.rules).toEqual(['Valid rule', 'Another valid']);
  });
});
```

**Step 2: Update analyzer.js**

Replace the full file:

```js
import Anthropic from '@anthropic-ai/sdk';
import { readFile } from 'fs/promises';
import { DIMENSIONS } from './dimensions.js';

export async function analyzeTranscript(conversationText, pendingRuleTexts = []) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { signals: [], rules: [] };
  }

  const promptTemplate = await readFile(
    new URL('../prompts/extract-preferences.md', import.meta.url),
    'utf8',
  );

  const dimensionDesc = Object.entries(DIMENSIONS)
    .map(([key, d]) => `- **${key}** (0.0 = ${d.low}, 1.0 = ${d.high})`)
    .join('\n');

  let pendingSection = '';
  if (pendingRuleTexts.length > 0) {
    const list = pendingRuleTexts.map(r => `- "${r}"`).join('\n');
    pendingSection = `If a candidate rule is semantically equivalent to an existing pending rule below, use the EXACT text of the existing rule instead of generating new wording.\n\nExisting pending rules:\n${list}`;
  }

  const prompt = promptTemplate
    .replace('{{DIMENSIONS}}', dimensionDesc)
    .replace('{{PENDING_RULES}}', pendingSection)
    .replace('{{TRANSCRIPT}}', conversationText);

  const client = new Anthropic();

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  return parseAnalysisResponse(response.content[0].text);
}

export function parseAnalysisResponse(text) {
  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const result = JSON.parse(cleaned);

    if (result.session_quality === 'none') return { signals: [], rules: [] };

    const signals = (result.signals || []).filter(
      s => DIMENSIONS[s.dimension] && typeof s.score === 'number',
    );

    const rules = (result.candidate_rules || []).filter(
      r => typeof r === 'string' && r.trim().length > 0,
    );

    return { signals, rules };
  } catch {
    return { signals: [], rules: [] };
  }
}
```

Key changes:
- `analyzeTranscript` accepts optional `pendingRuleTexts` array for prompt injection
- Returns `{ signals, rules }` instead of just signals array
- Export `parseAnalysisResponse` for testing (renamed from private `parseResponse`)
- `parseAnalysisResponse` extracts both signals and candidate_rules

**Step 3: Update extract-preferences.md prompt**

Append before the `## Conversation Transcript` section:

```markdown
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
```

NOTE: The Output Format section in the prompt must be REPLACED (not duplicated) since it now includes `candidate_rules`. The implementer should replace everything from `## Output Format` to `## Conversation Transcript` with the updated version.

**Step 4: Run tests**

Run: `cd /Users/sen/ai/your-taste && npx vitest run tests/analyzer.test.js`
Expected: All 6 tests PASS

**Step 5: Run full suite**

Run: `cd /Users/sen/ai/your-taste && npx vitest run`
Expected: All tests PASS. NOTE: some existing tests that call `analyzeTranscript` directly may need updating if they depend on the old return type (array vs object). Check `tests/backfill.test.js` and `tests/integration.test.js` — they may not call analyzeTranscript directly so may be fine.

**Step 6: Commit**

```bash
cd /Users/sen/ai/your-taste
git add src/analyzer.js tests/analyzer.test.js prompts/extract-preferences.md
git commit -m "feat: extend Haiku prompt to extract candidate behavioral rules"
```

---

### Task 4: Update SessionEnd Hook — Rule Accumulation

**Files:**
- Modify: `src/hooks/session-end.js`
- Modify: `src/backfill.js` (adapt to new analyzeTranscript return type)

**Step 1: Update session-end.js**

Replace the full file:

```js
#!/usr/bin/env node
import { parseTranscript, extractConversation } from '../transcript.js';
import { filterSensitiveData } from '../privacy.js';
import { readProfile, updateProfile } from '../profile.js';
import { analyzeTranscript } from '../analyzer.js';
import { readPending, updatePending, getPendingRuleTexts } from '../pending.js';

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

  // Analyze — now returns { signals, rules }
  const { signals, rules } = await analyzeTranscript(filtered, pendingTexts);

  // Update profile with dimension signals
  if (signals.length > 0) {
    const profile = await readProfile();
    await updateProfile(profile, signals);
  }

  // Accumulate candidate rules
  if (rules.length > 0) {
    await updatePending(pending, rules);
  }
}

main().catch(() => process.exit(0));
```

**Step 2: Update backfill.js to handle new return type**

In `src/backfill.js`, the `processSession` function calls `analyzeTranscript` which now returns `{ signals, rules }` instead of a signals array. Update the function:

```js
export async function processSession(transcriptPath) {
  const messages = await parseTranscript(transcriptPath);
  if (messages.length < 4) return [];

  const conversation = extractConversation(messages);
  if (conversation.length < 200) return [];

  const filtered = filterSensitiveData(conversation);
  const result = await analyzeTranscript(filtered);
  return result.signals || result; // backward compat: handle both old array and new object
}
```

Actually, cleaner approach — just return `result.signals` since backfill only cares about dimension signals (rules accumulation from backfill isn't needed, the user hasn't been using the system yet):

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

**Step 3: Run full test suite**

Run: `cd /Users/sen/ai/your-taste && npx vitest run`
Expected: All tests PASS

**Step 4: Commit**

```bash
cd /Users/sen/ai/your-taste
git add src/hooks/session-end.js src/backfill.js
git commit -m "feat: accumulate candidate rules in pending.yaml on session end"
```

---

### Task 5: Update SessionStart — taste.md-first Injection

**Files:**
- Modify: `src/hooks/session-start.js`
- Modify: `tests/session-start.test.js`

**Step 1: Update the tests**

Add new tests to `tests/session-start.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { renderInstructions } from '../src/instruction-renderer.js';
import { createDefaultProfile } from '../src/profile.js';
import { buildAdditionalContext } from '../src/hooks/session-start.js';

describe('session-start output format', () => {
  it('produces template instructions when no taste.md', () => {
    const profile = createDefaultProfile();
    profile.dimensions.risk_tolerance.score = 0.8;
    profile.dimensions.risk_tolerance.confidence = 0.6;
    const result = buildAdditionalContext(profile, null);
    expect(result).toContain('rewrite');
  });

  it('uses taste.md content when available', () => {
    const profile = createDefaultProfile();
    const tasteContent = '# Your Taste\n\n- Custom rule one\n- Custom rule two\n';
    const result = buildAdditionalContext(profile, tasteContent);
    expect(result).toContain('Custom rule one');
    expect(result).toContain('error handling'); // quality floor still present
  });

  it('returns null when no instructions and no taste.md', () => {
    const profile = createDefaultProfile();
    const result = buildAdditionalContext(profile, null);
    expect(result).toBeNull();
  });
});
```

**Step 2: Update session-start.js**

Export a `buildAdditionalContext` function for testability, and use taste.md-first logic:

```js
#!/usr/bin/env node
import { readProfile } from '../profile.js';
import { renderInstructions } from '../instruction-renderer.js';
import { readTasteFile } from '../taste-file.js';

const QUALITY_FLOOR = 'Apply these preferences on top of professional best practices. Never compromise error handling at system boundaries, security best practices, or data integrity.';

export function buildAdditionalContext(profile, tasteContent) {
  // taste.md takes priority when it has content
  if (tasteContent) {
    return `${tasteContent}\n\n${QUALITY_FLOOR}`;
  }

  // Fall back to template rendering
  return renderInstructions(profile);
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

  if (activeDims.length === 0 && !hasTaste) {
    process.exit(0);
  }

  const additionalContext = buildAdditionalContext(profile, tasteContent);

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

**Step 3: Run tests**

Run: `cd /Users/sen/ai/your-taste && npx vitest run`
Expected: All tests PASS

**Step 4: Commit**

```bash
cd /Users/sen/ai/your-taste
git add src/hooks/session-start.js tests/session-start.test.js
git commit -m "feat: taste.md-first injection with template fallback at session start"
```

---

### Task 6: CLI Review Commands + Skill

**Files:**
- Modify: `bin/cli.js`
- Create: `skills/review/SKILL.md`

**Step 1: Add review-data and review-apply to CLI**

Add to `bin/cli.js`:

```js
import { readPending, removePendingRules } from '../src/pending.js';
import { appendRules } from '../src/taste-file.js';
```

Add to the command routing:

```js
} else if (command === 'review-data') {
  await runReviewData();
} else if (command === 'review-apply') {
  await runReviewApply();
} else {
  // existing usage...
  console.log('  review-data   Output pending rules as JSON (for skills)');
  console.log('  review-apply  Apply review decisions from stdin JSON (for skills)');
}
```

Implement the functions:

```js
async function runReviewData() {
  const pending = await readPending();
  console.log(JSON.stringify(pending, null, 2));
}

async function runReviewApply() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  const decisions = JSON.parse(input);
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
```

**Step 2: Create the review skill**

Create `skills/review/SKILL.md`:

```markdown
---
name: review
description: Review and approve accumulated behavioral rules for your taste profile
allowed-tools: Bash(node *), AskUserQuestion
---

Review pending behavioral rules that your-taste has extracted from your sessions.

## Steps

1. Get pending rules data:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/cli.js" review-data
```

2. Filter rules with `count >= 3` from the output. These have been observed enough times to be meaningful.

3. If no rules qualify (all count < 3), tell the user:
   "No rules ready for review yet. Your behavioral patterns are still accumulating — keep using Claude Code and rules will surface when they appear consistently."

4. For each qualifying rule, present it to the user with:
   - The rule text
   - How many times it was observed (count)
   - Date range (first_seen to last_seen)
   Ask: "Accept, Edit, or Dismiss?"

5. Collect all decisions into this JSON format:
```json
{
  "accepted": ["rule text 1", "rule text 2"],
  "edited": [{"original": "old text", "revised": "user's edited text"}],
  "dismissed": ["rule text 3"]
}
```

6. Apply decisions:

```bash
echo '<the JSON above>' | node "${CLAUDE_PLUGIN_ROOT}/bin/cli.js" review-apply
```

7. Report results: how many rules were approved and added to taste.md.
```

**Step 3: Run full test suite**

Run: `cd /Users/sen/ai/your-taste && npx vitest run`
Expected: All tests PASS

**Step 4: Commit**

```bash
cd /Users/sen/ai/your-taste
git add bin/cli.js skills/review/SKILL.md
git commit -m "feat: taste review skill with CLI review-data and review-apply commands"
```

---

### Task 7: Integration Test — Full Rule Pipeline

**Files:**
- Modify: `tests/integration.test.js`

**Step 1: Add rule pipeline integration test**

Append to `tests/integration.test.js`:

```js
import { readPending, updatePending, getPendingRuleTexts, removePendingRules } from '../src/pending.js';
import { readTasteFile, appendRules } from '../src/taste-file.js';
import { buildAdditionalContext } from '../src/hooks/session-start.js';

describe('end-to-end: rule accumulation pipeline', () => {
  beforeEach(async () => {
    process.env.YOUR_TASTE_DIR = TEST_DIR;
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
    delete process.env.YOUR_TASTE_DIR;
  });

  it('accumulates rules and surfaces them after threshold', async () => {
    let pending = await readPending();

    // Simulate 3 sessions extracting the same rule
    pending = await updatePending(pending, ['Clean breaks over gradual migration']);
    pending = await readPending();
    pending = await updatePending(pending, ['Clean breaks over gradual migration']);
    pending = await readPending();
    pending = await updatePending(pending, ['Clean breaks over gradual migration']);
    pending = await readPending();

    const rule = pending.rules.find(r => r.text === 'Clean breaks over gradual migration');
    expect(rule.count).toBe(3);
  });

  it('approved rules appear in taste.md and get injected', async () => {
    // Approve a rule
    await appendRules(['Clean breaks over gradual migration']);

    // Verify taste.md has content
    const tasteContent = await readTasteFile();
    expect(tasteContent).toContain('Clean breaks over gradual migration');

    // Verify session-start uses taste.md
    const profile = createDefaultProfile();
    const context = buildAdditionalContext(profile, tasteContent);
    expect(context).toContain('Clean breaks over gradual migration');
    expect(context).toContain('error handling'); // quality floor
  });

  it('falls back to template when no taste.md', async () => {
    const profile = createDefaultProfile();
    profile.dimensions.risk_tolerance.score = 0.8;
    profile.dimensions.risk_tolerance.confidence = 0.6;

    const context = buildAdditionalContext(profile, null);
    expect(context).toContain('rewrite'); // template instruction
  });
});
```

NOTE: The existing integration tests use `beforeEach/afterEach` with `TEST_DIR`. If the new describe block is added inside the existing file, make sure the setup/teardown is shared or duplicated. The implementer should read the current integration test file and structure accordingly.

**Step 2: Run full suite**

Run: `cd /Users/sen/ai/your-taste && npx vitest run`
Expected: All tests PASS

**Step 3: Commit**

```bash
cd /Users/sen/ai/your-taste
git add tests/integration.test.js
git commit -m "test: integration tests for full rule accumulation pipeline"
```

---

### Task 8: Version Bump + Final Verification

**Files:**
- Modify: `package.json` (version to 0.3.0)
- Modify: `.claude-plugin/plugin.json` (version to 0.3.0)

**Step 1: Bump versions**

In `package.json`: `"version": "0.2.0"` → `"version": "0.3.0"`
In `.claude-plugin/plugin.json`: `"version": "0.2.0"` → `"version": "0.3.0"`

**Step 2: Run full test suite**

Run: `cd /Users/sen/ai/your-taste && npx vitest run`
Expected: All tests PASS

**Step 3: Commit**

```bash
cd /Users/sen/ai/your-taste
git add package.json .claude-plugin/plugin.json
git commit -m "chore: bump version to 0.3.0"
```
