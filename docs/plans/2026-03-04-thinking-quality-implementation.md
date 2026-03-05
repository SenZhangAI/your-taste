# Thinking Quality Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reframe your-taste from preference learning to thinking quality optimization — extract reasoning gaps instead of preference signals, synthesize an evolving thinking framework instead of a user profile.

**Architecture:** Replace Stage 1/Stage 2 prompts to extract reasoning gaps (5 categories) and synthesize a 3-section thinking framework. Unify SessionEnd to use the new Stage 1 pipeline. Remove dimension scoring system. Update injection to deliver evolved checkpoints.

**Tech Stack:** Node.js, Vitest, Claude Code hooks, Markdown prompts

**Design doc:** `docs/plans/2026-03-04-thinking-quality-redesign.md`

---

### Task 1: Replace Stage 1 prompt — extract reasoning gaps

**Files:**
- Rewrite: `prompts/extract-signals.md`

**Step 1: Write the new extract-signals.md prompt**

Replace entire file with:

```markdown
You are a JSON-only reasoning analyst. You MUST respond with a single JSON object — nothing else.

Your task: find REASONING GAPS in this conversation — moments where AI's thinking broke down and the user had to correct or redirect.

## What Counts as a Reasoning Gap

A reasoning gap is a moment where:
- AI skipped a verification step and acted on unverified assumptions
- AI missed adjacent implications (didn't "think one step ahead")
- AI responded to surface request (C) instead of tracing to underlying need (A)
- AI treated a hypothesis as fact without checking
- AI over-extended scope when a targeted response was needed

Signal strength matters. Only extract STRONG signals:

| Reaction | Strength | Extract? |
|----------|----------|----------|
| User corrects AI's reasoning process | strong | YES |
| User points out a skipped verification step | strong | YES |
| User redirects AI to think deeper/broader | strong | YES |
| User interrupts over-scoped analysis | strong | YES |
| User accepts without comment | weak | NO — skip |
| User says "ok", "好的", moves on | weak | NO — skip |

## What to Ignore

- Skill/knowledge gaps ("AI didn't know about X") — NOT a reasoning gap
- Tool limitations or workarounds — NOT a reasoning gap
- One-time situational behavior (rushing, testing) — NOT a stable pattern
- Style/preference corrections ("use Chinese comments") — NOT a reasoning gap

## Reasoning Gap Categories

Classify each gap into one of these categories:

| Category | What broke | Example |
|----------|-----------|---------|
| verification_skip | Didn't verify before acting | Accepted hypothesis as fact, asserted without reading code |
| breadth_miss | Didn't scan adjacent implications | Fixed one issue without checking related assumptions |
| depth_skip | Stopped at surface, didn't trace root | Responded to C without tracing to A |
| assumption_leak | Hidden assumption not identified | Treated casual input as specification |
| overreach | Over-extended scope or complexity | Full analysis when user wanted a targeted fix |

## A → B → C Inference

Users think A → B → C, then communicate C. When extracting gaps:
- Don't extract "user prefers X" — extract "AI skipped step Y"
- C: User corrects a join query → Gap is NOT "user prefers verified joins" → Gap IS "AI skipped FK validation before writing code"
- C: User interrupts broad analysis → Gap is NOT "user prefers focused scope" → Gap IS "AI over-extended when clue pointed to specific target"

Extract the MISSING REASONING STEP, not the surface correction.

## Session Context

Also extract strategic context if present:
- **topics**: Major subjects discussed (1-3, abstract only)
- **decisions**: What was explicitly decided
- **open_questions**: What was raised but unresolved

Keep entries concise (max 15 words). No code, no file paths.

## Language

Write ALL text fields (what_ai_did, what_broke, missing_step, checkpoint, session_context) in the SAME language as the conversation transcript. Do NOT translate — preserve the original language to avoid meaning distortion.
Only enum fields (strength, category, session_quality) and user_language stay in English.

## Output Format

You MUST return ONLY a JSON object. No text before or after. No markdown fencing.

{
  "reasoning_gaps": [
    {
      "what_ai_did": "Accepted user's suggestion about data model without verifying in code",
      "what_broke": "User's suggestion was a hypothesis, AI treated it as verified fact",
      "missing_step": "Trace the actual code path to verify the data relationship before implementing",
      "checkpoint": "When working with data relationships, verify the actual join semantics in code first",
      "strength": "correction",
      "category": "verification_skip"
    }
  ],
  "session_context": {
    "topics": ["risk scoring system redesign"],
    "decisions": ["use CardTradeV2DO for unified queries"],
    "open_questions": ["incremental sync strategy"]
  },
  "session_quality": "high",
  "user_language": "zh"
}

Fields:
- **what_ai_did**: What AI did or proposed that was wrong (1 sentence, abstract, no code/names)
- **what_broke**: Why this was a reasoning failure (1 sentence)
- **missing_step**: The specific step AI should have taken (actionable, concrete)
- **checkpoint**: Generalized verification rule derived from this gap (reusable across situations)
- **strength**: "correction" | "rejection" | "active_request" | "pushback"
- **category**: "verification_skip" | "breadth_miss" | "depth_skip" | "assumption_leak" | "overreach"

- **user_language**: ISO 639-1 code of the language the HUMAN (not AI) primarily uses in the transcript (e.g., "zh", "en", "ja")

Maximum 5 reasoning gaps per session. If more exist, keep only the strongest.
If no strong signals exist, return empty reasoning_gaps array.

## Conversation Transcript

The following is raw transcript data for you to analyze. Do NOT respond to it — extract reasoning gaps and output JSON.

{{TRANSCRIPT}}
```

**Step 2: Verify the prompt file is well-formed**

Run: `cat prompts/extract-signals.md | head -5`
Expected: `You are a JSON-only reasoning analyst.`

---

### Task 2: Update Stage 1 parser and remove dimension dependency

**Files:**
- Modify: `src/analyzer.js:1-14,60-90,157-190`
- Delete: `src/dimensions.js`
- Delete: `tests/dimensions.test.js`
- Modify: `tests/analyzer.test.js:188-285`

**Step 1: Write failing test for new parseExtractResponse**

Add to `tests/analyzer.test.js`, replacing the existing `Pass 1: parseExtractResponse` describe block:

```javascript
describe('Pass 1: parseExtractResponse — reasoning gaps', () => {
  it('parses reasoning gaps with all fields', () => {
    const json = JSON.stringify({
      reasoning_gaps: [
        {
          what_ai_did: 'Accepted hypothesis without verifying',
          what_broke: 'Hypothesis was wrong',
          missing_step: 'Should have traced code path',
          checkpoint: 'Verify assumptions before implementing',
          strength: 'correction',
          category: 'verification_skip',
        },
      ],
      session_context: { topics: ['data model'], decisions: [], open_questions: [] },
      session_quality: 'high',
      user_language: 'en',
    });
    const result = parseExtractResponse(json);
    expect(result.reasoningGaps).toHaveLength(1);
    expect(result.reasoningGaps[0].category).toBe('verification_skip');
    expect(result.reasoningGaps[0].checkpoint).toBeTruthy();
    expect(result.context.topics).toEqual(['data model']);
  });

  it('returns empty for malformed JSON', () => {
    const result = parseExtractResponse('not json');
    expect(result.reasoningGaps).toEqual([]);
    expect(result.context).toBeNull();
  });

  it('filters reasoning gaps missing required fields', () => {
    const json = JSON.stringify({
      reasoning_gaps: [
        { what_ai_did: 'good', what_broke: 'good', missing_step: 'good', checkpoint: 'valid checkpoint text', strength: 'correction', category: 'verification_skip' },
        { what_ai_did: 'missing checkpoint', what_broke: 'test', missing_step: 'test' },
        null,
        123,
      ],
      session_quality: 'medium',
    });
    const result = parseExtractResponse(json);
    expect(result.reasoningGaps).toHaveLength(1);
  });

  it('defaults invalid strength to correction', () => {
    const json = JSON.stringify({
      reasoning_gaps: [
        { what_ai_did: 'a', what_broke: 'b', missing_step: 'c', checkpoint: 'valid checkpoint here', strength: 'unknown', category: 'verification_skip' },
      ],
    });
    const result = parseExtractResponse(json);
    expect(result.reasoningGaps[0].strength).toBe('correction');
  });

  it('defaults invalid category to verification_skip', () => {
    const json = JSON.stringify({
      reasoning_gaps: [
        { what_ai_did: 'a', what_broke: 'b', missing_step: 'c', checkpoint: 'valid checkpoint here', strength: 'correction', category: 'nonexistent' },
      ],
    });
    const result = parseExtractResponse(json);
    expect(result.reasoningGaps[0].category).toBe('verification_skip');
  });

  // Backward compat: old format with decision_points still parses
  it('parses legacy decision_points format into reasoningGaps', () => {
    const json = JSON.stringify({
      decision_points: [
        {
          ai_proposed: 'Listed 3 options',
          user_reacted: 'Just pick one',
          strength: 'correction',
          dimension: 'communication_style',
          principle: 'Recommend one approach, not menus',
        },
      ],
      session_quality: 'high',
    });
    const result = parseExtractResponse(json);
    expect(result.reasoningGaps).toHaveLength(1);
    expect(result.reasoningGaps[0].what_ai_did).toBe('Listed 3 options');
    expect(result.reasoningGaps[0].checkpoint).toBe('Recommend one approach, not menus');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/sen/ai/your-taste && npx vitest run tests/analyzer.test.js --reporter=verbose 2>&1 | tail -20`
Expected: FAIL — `reasoningGaps` property doesn't exist yet

**Step 3: Update analyzer.js — remove dimension imports, rewrite parseExtractResponse**

In `src/analyzer.js`:

1. Remove the dimension import line: `import { DIMENSIONS, DIMENSION_NAMES } from './dimensions.js';`
2. Remove `buildDimensionDesc()` function (lines 9-13)
3. Add new constants:

```javascript
const VALID_CATEGORIES = new Set([
  'verification_skip', 'breadth_miss', 'depth_skip', 'assumption_leak', 'overreach',
]);
```

4. Rewrite `extractSignals()` to not use DIMENSION_NAMES:

```javascript
export async function extractSignals(conversationText) {
  const promptTemplate = await readFile(
    new URL('../prompts/extract-signals.md', import.meta.url),
    'utf8',
  );

  const response = await callLLM(promptTemplate, {
    TRANSCRIPT: conversationText,
  });

  const parsed = parseExtractResponse(response);
  debug(`extract: ${parsed.reasoningGaps.length} reasoning gaps, context=${parsed.context ? 'yes' : 'null'}`);
  return parsed;
}
```

5. Rewrite `parseExtractResponse()`:

```javascript
export function parseExtractResponse(text) {
  try {
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const result = JSON.parse(cleaned);

    // Support new format (reasoning_gaps) and legacy format (decision_points)
    const rawGaps = result.reasoning_gaps || [];
    const legacyPoints = result.decision_points || [];

    const reasoningGaps = rawGaps
      .filter(g =>
        g && typeof g === 'object' &&
        typeof g.what_ai_did === 'string' &&
        typeof g.what_broke === 'string' &&
        typeof g.checkpoint === 'string' &&
        g.checkpoint.trim().length > 0
      )
      .map(g => ({
        what_ai_did: g.what_ai_did.trim(),
        what_broke: g.what_broke.trim(),
        missing_step: typeof g.missing_step === 'string' ? g.missing_step.trim() : '',
        checkpoint: g.checkpoint.trim(),
        strength: VALID_STRENGTHS.has(g.strength) ? g.strength : 'correction',
        category: VALID_CATEGORIES.has(g.category) ? g.category : 'verification_skip',
      }));

    // Legacy backward compat: convert decision_points to reasoning gaps
    const legacyGaps = legacyPoints
      .filter(dp =>
        dp && typeof dp === 'object' &&
        typeof dp.ai_proposed === 'string' &&
        typeof dp.principle === 'string' &&
        dp.principle.trim().length > 0
      )
      .map(dp => ({
        what_ai_did: dp.ai_proposed.trim(),
        what_broke: typeof dp.user_reacted === 'string' ? dp.user_reacted.trim() : '',
        missing_step: '',
        checkpoint: dp.principle.trim(),
        strength: VALID_STRENGTHS.has(dp.strength) ? dp.strength : 'correction',
        category: 'verification_skip',
      }));

    const allGaps = [...reasoningGaps, ...legacyGaps];

    const context = validateContext(result.session_context);
    const userLanguage = typeof result.user_language === 'string' ? result.user_language.trim().toLowerCase() : null;
    return { reasoningGaps: allGaps, context, userLanguage };
  } catch {
    return { reasoningGaps: [], context: null, userLanguage: null };
  }
}
```

6. Remove `parseAnalysisResponse()` function entirely (legacy single-pass)

7. Remove `buildLanguageInstruction()` that references dimensions — replace with simpler version that only handles language:

```javascript
function buildLanguageInstruction(lang) {
  if (lang === 'en') return '';
  const name = languageName(lang);
  return `## Output Language\n\nWrite all text fields in ${name}. Only enum/structural fields stay in English.`;
}
```

**Step 4: Run tests**

Run: `cd /Users/sen/ai/your-taste && npx vitest run tests/analyzer.test.js --reporter=verbose 2>&1 | tail -30`
Expected: New reasoning gap tests PASS, old `parseAnalysisResponse` tests need removal

**Step 5: Remove old parseAnalysisResponse tests**

Delete the entire first `describe('analyzer response parsing'` block from `tests/analyzer.test.js` (the one testing `parseAnalysisResponse`). Keep only the new reasoning gaps tests and the Pass 2 synthesis tests.

**Step 6: Delete dimensions.js and its test**

Run: `rm src/dimensions.js tests/dimensions.test.js`

**Step 7: Run full test suite**

Run: `cd /Users/sen/ai/your-taste && npx vitest run --reporter=verbose 2>&1 | tail -40`
Expected: Some tests in other files may fail due to dimension references — fix in next tasks

**Step 8: Commit**

```bash
git add -A && git commit -m "refactor: replace preference extraction with reasoning gap detection

- Rewrite extract-signals.md prompt: decision points → reasoning gaps
- 5 reasoning gap categories replace 6 preference dimensions
- Remove dimensions.js and dimension scoring
- parseExtractResponse returns reasoningGaps[] with backward compat for legacy decision_points
- Remove parseAnalysisResponse (legacy single-pass)"
```

---

### Task 3: Update signals.js for reasoning gaps

**Files:**
- Modify: `src/signals.js:16-21,55-82`
- Modify: `tests/signals.test.js`

**Step 1: Write failing test**

Update `tests/signals.test.js` — change `decision_points` references to `reasoning_gaps`:

```javascript
it('appends and reads back signals', async () => {
  const gaps = [{ what_ai_did: 'x', what_broke: 'y', checkpoint: 'test checkpoint text here', strength: 'correction', category: 'verification_skip' }];
  await appendSignals('/path/session1.jsonl', gaps);
  await appendSignals('/path/session2.jsonl', []);

  const { entries, sessions } = await readAllSignals();
  expect(entries).toHaveLength(2);
  expect(sessions.has('/path/session1.jsonl')).toBe(true);
  expect(entries[0].reasoning_gaps).toHaveLength(1);
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/sen/ai/your-taste && npx vitest run tests/signals.test.js --reporter=verbose 2>&1 | tail -20`
Expected: FAIL — `reasoning_gaps` property not found

**Step 3: Update signals.js**

1. In `appendSignals()`, change `decision_points` key to `reasoning_gaps`:

```javascript
export async function appendSignals(sessionPath, reasoningGaps, context = null) {
  const dir = getDir();
  await mkdir(dir, { recursive: true });
  const entry = JSON.stringify({ session: sessionPath, reasoning_gaps: reasoningGaps, context });
  await appendFile(getSignalsPath(), entry + '\n', 'utf8');
  debug(`signals: appended ${reasoningGaps.length} reasoning gaps from ${sessionPath}`);
}
```

2. In `collectForSynthesis()`, change `decision_points` to `reasoning_gaps` and update quality filter to use `checkpoint` instead of `principle`:

```javascript
const MIN_CHECKPOINT_LENGTH = 15;

export function collectForSynthesis(entries) {
  const all = [];
  for (const entry of entries) {
    const gaps = entry.reasoning_gaps || entry.decision_points || [];
    for (const gap of gaps) {
      all.push(gap);
    }
  }

  const before = all.length;
  const filtered = all.filter(g => {
    const text = g.checkpoint || g.principle || '';
    return text.length >= MIN_CHECKPOINT_LENGTH;
  });
  if (filtered.length < before) {
    debug(`signals: filtered ${before - filtered.length} low-quality gaps (checkpoint < ${MIN_CHECKPOINT_LENGTH} chars)`);
  }

  filtered.sort((a, b) => (STRENGTH_ORDER[a.strength] ?? 9) - (STRENGTH_ORDER[b.strength] ?? 9));

  if (filtered.length > MAX_SIGNALS_FOR_SYNTHESIS) {
    debug(`signals: capping ${filtered.length} → ${MAX_SIGNALS_FOR_SYNTHESIS} for synthesis`);
    return filtered.slice(0, MAX_SIGNALS_FOR_SYNTHESIS);
  }
  return filtered;
}
```

3. In `clearSignals()`, update the meaningful filter:

```javascript
const meaningful = content.split('\n').filter(line => {
  if (!line.trim()) return false;
  try {
    const entry = JSON.parse(line);
    return (entry.reasoning_gaps?.length > 0) || (entry.decision_points?.length > 0);
  } catch { return false; }
});
```

**Step 4: Update all signal tests**

Update `tests/signals.test.js` to use `reasoning_gaps` everywhere. Keep backward compat tests for `decision_points`:

```javascript
it('collectForSynthesis handles legacy decision_points format', () => {
  const entries = [
    { session: '/s.jsonl', decision_points: [
      { strength: 'rejection', dimension: 'risk_tolerance', principle: 'This is a meaningful principle about user behavior' },
    ]},
  ];
  const result = collectForSynthesis(entries);
  expect(result).toHaveLength(1);
});
```

**Step 5: Run tests**

Run: `cd /Users/sen/ai/your-taste && npx vitest run tests/signals.test.js --reporter=verbose 2>&1 | tail -20`
Expected: PASS

**Step 6: Commit**

```bash
git add src/signals.js tests/signals.test.js && git commit -m "refactor: signals.js uses reasoning_gaps format with legacy compat"
```

---

### Task 4: Replace Stage 2 prompt — synthesize thinking framework

**Files:**
- Rewrite: `prompts/synthesize-profile.md`

**Step 1: Write the new synthesize-profile.md prompt**

Replace entire file with:

```markdown
You are an AI reasoning analyst. You MUST respond with ONLY Markdown — no JSON, no code fences, no preamble.

Your task: synthesize reasoning gaps from multiple coding sessions into an **evolving thinking framework** that prevents AI from making the same reasoning mistakes. Write in second-person instructional voice — you are telling a future AI what verification steps to take.

## Voice Guide

- Second person, imperative: "Before X, verify Y" — not "The user expects verification"
- Focus on WHAT TO DO, not what the user prefers: "Trace the code path" — not "User prefers code tracing"
- Include the WHY from failure: "because skipping this led to implementing based on wrong assumptions"
- Be specific and actionable: "Check: what does this FK field actually contain? How is it populated?" — not "Verify data relationships"

## Input

You receive:
1. Reasoning gaps from multiple sessions (each has: what_ai_did, what_broke, missing_step, checkpoint, category)
2. Existing framework (if any) to merge with
3. Existing confirmed rules (to avoid duplicating)

## Your Job

Produce a complete thinking framework with exactly three sections.

### Section 1: ## {{REASONING_CHECKPOINTS_HEADER}}

Verification steps AI must take before acting. Extracted from historical reasoning failures.

Requirements:
- Each checkpoint is a concrete verification step, not an abstract principle
- Format: `- **Checkpoint name**: When [trigger condition], verify [specific step] — because [what went wrong without it]. (N sessions, category)`
- Group related checkpoints (e.g., all verification_skip checkpoints together)
- Only checkpoints with 2+ sessions of evidence
- Maximum 8 checkpoints
- Order by frequency (most triggered first)

### Section 2: ## {{DOMAIN_REASONING_HEADER}}

How to reason correctly in specific problem domains. These are domain-specific thinking rules, not preferences.

Requirements:
- Each rule describes HOW TO THINK in a specific context, not what the user likes
- Format:
  - **Rule name** (N sessions)
    When working with [domain/context]: [specific reasoning approach]
    Evidence: [what went wrong when this wasn't followed]
- 2+ sessions of evidence required
- Maximum 6 rules
- Rules with 4+ sessions that generalize beyond one domain → promote to Section 1

### Section 3: ## {{FAILURE_PATTERNS_HEADER}}

AI's recurring reasoning errors. Highest-value preventive content.

Requirements:
- Format: `- **AI pattern**: [what AI tends to do] → **Missing step**: [what should happen instead] → **Because**: [root cause of the reasoning failure]`
- Focus on systematic patterns, not one-off mistakes
- Only include if there are 2+ sessions showing the same pattern
- Maximum 5 patterns

## Merging with Existing Framework

When existing framework is provided:
- Existing checkpoint supported by new evidence → update session count and evidence
- Existing checkpoint contradicted by new evidence → delete or downgrade
- New evidence forms new checkpoint → add to appropriate section
- Do NOT blindly preserve old content — re-evaluate everything against all evidence

## A → B → C Inference

When analyzing reasoning gaps:
- Extract the MISSING STEP, not the user's preference
- "User corrected AI's join query" → missing step is "verify FK semantics", NOT "user prefers verified queries"
- The test: does this describe what AI should DO differently, or what the user LIKES? Only the former belongs here.

{{EXISTING_OBSERVATIONS}}

{{TASTE_RULES}}

{{LANGUAGE}}

## Reasoning Gaps from Multiple Sessions

The following reasoning gaps were extracted from the AI's coding sessions. Analyze them as a unified dataset:

{{SIGNALS}}
```

**Step 2: Verify prompt is well-formed**

Run: `cat prompts/synthesize-profile.md | head -5`
Expected: `You are an AI reasoning analyst.`

---

### Task 5: Update Stage 2 caller in analyzer.js

**Files:**
- Modify: `src/analyzer.js:80-119`
- Modify: `src/lang.js:69-112`

**Step 1: Update synthesizeProfile() in analyzer.js**

Replace the `synthesizeProfile` function to use new field names and format reasoning gaps differently:

```javascript
export async function synthesizeProfile(reasoningGaps, existingObservations = null, confirmedRuleTexts = [], model = null) {
  const promptTemplate = await readFile(
    new URL('../prompts/synthesize-profile.md', import.meta.url),
    'utf8',
  );

  const signalsText = reasoningGaps.map((g, i) => {
    const what = g.what_ai_did || g.ai_proposed || '';
    const broke = g.what_broke || g.user_reacted || '';
    const step = g.missing_step || '';
    const check = g.checkpoint || g.principle || '';
    const cat = g.category || 'verification_skip';
    let line = `${i + 1}. [${g.strength}] (${cat}) AI did: ${what} → Broke: ${broke}`;
    if (step) line += ` → Missing step: ${step}`;
    if (check) line += ` → Checkpoint: ${check}`;
    return line;
  }).join('\n');

  const lang = await readLang();
  const t = getTemplates(lang);

  const existingSection = existingObservations
    ? `## Existing Framework\n\nMerge new evidence into this existing framework. Re-evaluate all content against the combined evidence.\n\n${existingObservations}`
    : '';

  const rulesSection = confirmedRuleTexts.length > 0
    ? `## Existing Confirmed Rules\n\nDo NOT duplicate these in the framework:\n${confirmedRuleTexts.map(r => `- "${r}"`).join('\n')}`
    : '';

  const response = await callLLM(promptTemplate, {
    REASONING_CHECKPOINTS_HEADER: t.reasoningCheckpointsHeader || 'Reasoning Checkpoints',
    DOMAIN_REASONING_HEADER: t.domainReasoningHeader || 'Domain Reasoning',
    FAILURE_PATTERNS_HEADER: t.failurePatternsHeader || 'Failure Patterns',
    EXISTING_OBSERVATIONS: existingSection,
    TASTE_RULES: rulesSection,
    LANGUAGE: buildLanguageInstruction(lang),
    SIGNALS: signalsText,
  }, { timeoutMs: 360_000, model });

  const result = parseSynthesisResponse(response);
  debug(`synthesize: produced ${result.length} chars of framework markdown`);
  return result;
}
```

**Step 2: Update lang.js templates**

Add new section header templates to `src/lang.js`, replacing old ones:

```javascript
const TEMPLATES = {
  en: {
    globalContextHeader: '# Cross-Project Focus',
    globalContextInjection: '### Cross-Project Focus',
    contextHeader: '# Project Context',
    contextDecisions: '## Recent Decisions',
    contextQuestions: '## Open Questions',
    contextLastSession: '## Last Session',
    // New thinking framework headers
    reasoningCheckpointsHeader: 'Reasoning Checkpoints',
    domainReasoningHeader: 'Domain Reasoning',
    failurePatternsHeader: 'Failure Patterns',
    // Legacy headers (for reading old observations.md)
    thinkingPatternsHeader: 'Thinking Patterns',
    behavioralPatternsHeader: 'Behavioral Patterns',
    workingPrinciplesHeader: 'Working Principles',
    suggestedRulesHeader: 'Suggested Rules',
    commonMisreadsHeader: 'Common Misreads',
  },
  zh: {
    globalContextHeader: '# 跨项目关注方向',
    globalContextInjection: '### 跨项目关注方向',
    contextHeader: '# 项目上下文',
    contextDecisions: '## 近期决策',
    contextQuestions: '## 待解决问题',
    contextLastSession: '## 上次会话',
    reasoningCheckpointsHeader: '推理检查点',
    domainReasoningHeader: '领域推理',
    failurePatternsHeader: '失败模式',
    thinkingPatternsHeader: '思维模式',
    behavioralPatternsHeader: '行为模式',
    workingPrinciplesHeader: '工作原则',
    suggestedRulesHeader: '建议规则',
    commonMisreadsHeader: '常见误读',
  },
  ja: {
    globalContextHeader: '# クロスプロジェクト フォーカス',
    globalContextInjection: '### クロスプロジェクト フォーカス',
    contextHeader: '# プロジェクトコンテキスト',
    contextDecisions: '## 最近の決定',
    contextQuestions: '## 未解決の質問',
    contextLastSession: '## 前回のセッション',
    reasoningCheckpointsHeader: 'Reasoning Checkpoints',
    domainReasoningHeader: 'Domain Reasoning',
    failurePatternsHeader: 'Failure Patterns',
    thinkingPatternsHeader: 'Thinking Patterns',
    behavioralPatternsHeader: 'Behavioral Patterns',
    workingPrinciplesHeader: 'Working Principles',
    suggestedRulesHeader: 'Suggested Rules',
    commonMisreadsHeader: 'Common Misreads',
  },
};
```

**Step 3: Run tests**

Run: `cd /Users/sen/ai/your-taste && npx vitest run --reporter=verbose 2>&1 | tail -30`
Expected: PASS (synthesis response parsing unchanged — still strips markdown fences)

**Step 4: Commit**

```bash
git add src/analyzer.js src/lang.js prompts/synthesize-profile.md && git commit -m "refactor: Stage 2 synthesizes thinking framework from reasoning gaps

- New 3-section output: Reasoning Checkpoints, Domain Reasoning, Failure Patterns
- Replaces 4-section profile: Thinking Patterns, Working Principles, Suggested Rules, Common Misreads
- Add new localized section headers (zh: 推理检查点, 领域推理, 失败模式)"
```

---

### Task 6: Update observations.js for new section names

**Files:**
- Modify: `src/observations.js:51-78`
- Modify: `tests/observations.test.js`

**Step 1: Write failing test**

Add to `tests/observations.test.js`:

```javascript
describe('extractReasoningCheckpoints', () => {
  it('extracts English reasoning checkpoints section', () => {
    const md = '## Reasoning Checkpoints\n\nCheckpoint 1\nCheckpoint 2\n\n## Domain Reasoning\n\nSomething';
    expect(extractReasoningCheckpoints(md)).toBe('Checkpoint 1\nCheckpoint 2');
  });

  it('extracts Chinese header', () => {
    const md = '## 推理检查点\n\n检查点一\n\n## 领域推理\n\nSomething';
    expect(extractReasoningCheckpoints(md)).toBe('检查点一');
  });

  it('falls back to legacy Thinking Patterns header', () => {
    const md = '## Thinking Patterns\n\nLegacy pattern\n\n## Working Principles\n\nSomething';
    expect(extractReasoningCheckpoints(md)).toBe('Legacy pattern');
  });

  it('returns null when no matching section', () => {
    expect(extractReasoningCheckpoints('## Other\n\nContent')).toBeNull();
  });

  it('returns null when markdown is null', () => {
    expect(extractReasoningCheckpoints(null)).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/sen/ai/your-taste && npx vitest run tests/observations.test.js --reporter=verbose 2>&1 | tail -20`
Expected: FAIL — `extractReasoningCheckpoints` not found

**Step 3: Update observations.js**

Add `extractReasoningCheckpoints` function (replaces `extractThinkingPatterns`):

```javascript
/**
 * Extract the Reasoning Checkpoints section for UserPromptSubmit injection.
 * Falls back to legacy "Thinking Patterns" header for backward compat.
 */
export function extractReasoningCheckpoints(markdown) {
  if (!markdown) return null;
  const headers = ['Reasoning Checkpoints', '推理检查点', 'Thinking Patterns', '思维模式'];
  for (const h of headers) {
    const section = extractSection(markdown, h);
    if (section) return section;
  }
  return null;
}
```

Keep `extractThinkingPatterns` as a deprecated alias:

```javascript
/** @deprecated Use extractReasoningCheckpoints instead */
export function extractThinkingPatterns(markdown) {
  return extractReasoningCheckpoints(markdown);
}
```

**Step 4: Run tests**

Run: `cd /Users/sen/ai/your-taste && npx vitest run tests/observations.test.js --reporter=verbose 2>&1 | tail -20`
Expected: PASS

**Step 5: Commit**

```bash
git add src/observations.js tests/observations.test.js && git commit -m "feat: extractReasoningCheckpoints with legacy fallback"
```

---

### Task 7: Update instruction-renderer.js for new sections

**Files:**
- Modify: `src/instruction-renderer.js`
- Modify: `tests/instruction-renderer.test.js`

**Step 1: Write failing test**

Add to `tests/instruction-renderer.test.js`:

```javascript
it('renders new framework sections: domain reasoning and failure patterns', () => {
  const md = `## Reasoning Checkpoints

- **Verify FK**: check join keys

## Domain Reasoning

- **DB joins** (3 sessions)

## Failure Patterns

- **AI pattern**: accepts hypothesis as fact`;

  const result = renderFromObservations(md);
  expect(result).not.toContain('Verify FK'); // checkpoints excluded (injected by UserPromptSubmit)
  expect(result).toContain('DB joins');
  expect(result).toContain('accepts hypothesis as fact');
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/sen/ai/your-taste && npx vitest run tests/instruction-renderer.test.js --reporter=verbose 2>&1 | tail -20`
Expected: FAIL — new sections not recognized

**Step 3: Update instruction-renderer.js**

```javascript
import { extractSection } from './observations.js';

const OBSERVATIONS_HEADER = "Working context for this user (learned from past collaboration):";

export function renderFromObservations(observationsMarkdown) {
  if (!observationsMarkdown) return null;

  const sections = [];

  // Reasoning Checkpoints excluded — injected by UserPromptSubmit hook instead

  // Domain Reasoning (new) + Working Principles / Behavioral Patterns (legacy)
  const domainHeaders = ['Domain Reasoning', '领域推理', 'Working Principles', '工作原则', 'Behavioral Patterns', '行为模式'];
  let domain = null;
  let domainLabel = 'Domain Reasoning';
  for (const h of domainHeaders) {
    domain = extractSection(observationsMarkdown, h);
    if (domain) {
      domainLabel = h;
      break;
    }
  }

  // Failure Patterns (new) + Common Misreads (legacy)
  const failureHeaders = ['Failure Patterns', '失败模式', 'Common Misreads', '常见误读'];
  let failures = null;
  let failureLabel = 'Failure Patterns';
  for (const h of failureHeaders) {
    failures = extractSection(observationsMarkdown, h);
    if (failures) {
      failureLabel = h;
      break;
    }
  }

  if (domain) sections.push(`### ${domainLabel}\n\n${domain}`);
  if (failures) sections.push(`### ${failureLabel}\n\n${failures}`);

  if (sections.length === 0) return null;

  return `${OBSERVATIONS_HEADER}\n\n${sections.join('\n\n')}`;
}
```

**Step 4: Run tests**

Run: `cd /Users/sen/ai/your-taste && npx vitest run tests/instruction-renderer.test.js --reporter=verbose 2>&1 | tail -20`
Expected: PASS

**Step 5: Commit**

```bash
git add src/instruction-renderer.js tests/instruction-renderer.test.js && git commit -m "refactor: instruction-renderer supports new framework sections with legacy fallback"
```

---

### Task 8: Update UserPromptSubmit hook — inject reasoning checkpoints

**Files:**
- Modify: `src/hooks/user-prompt.js:12-30`
- Modify: `prompts/thinking-framework.md`
- Modify: `tests/user-prompt.test.js`

**Step 1: Update user-prompt.js**

Replace the thinking patterns injection with reasoning checkpoints:

```javascript
import { readObservations, extractReasoningCheckpoints } from '../observations.js';
```

And in `buildUserPromptContext`:

```javascript
// P1: Reasoning checkpoints (evolved) or static framework (bootstrap)
let framework = '';

// Try evolved checkpoints from observations first
try {
  const observations = await readObservations();
  const checkpoints = extractReasoningCheckpoints(observations);
  if (checkpoints) {
    framework = `## Reasoning Checkpoints\n\n${checkpoints}`;
  }
} catch { /* no observations */ }

// Fall back to static thinking framework if no evolved checkpoints
if (!framework) {
  try {
    framework = await readFile(
      new URL('../../prompts/thinking-framework.md', import.meta.url),
      'utf8',
    );
  } catch { /* template missing */ }
}
```

**Step 2: Update thinking-framework.md header comment**

Add to top of `prompts/thinking-framework.md`:

```markdown
<!-- Bootstrap thinking framework. Used when observations.md has no Reasoning Checkpoints yet.
     Once enough reasoning gaps are accumulated and synthesized, this file is no longer injected. -->
```

**Step 3: Run tests**

Run: `cd /Users/sen/ai/your-taste && npx vitest run tests/user-prompt.test.js --reporter=verbose 2>&1 | tail -20`
Expected: PASS (may need minor adjustments for import change)

**Step 4: Commit**

```bash
git add src/hooks/user-prompt.js prompts/thinking-framework.md tests/user-prompt.test.js && git commit -m "refactor: UserPromptSubmit injects evolved reasoning checkpoints, static framework as fallback"
```

---

### Task 9: Unify SessionEnd hook to use Stage 1 pipeline

**Files:**
- Modify: `src/hooks/session-end.js`
- Delete: `prompts/analyze-session.md`
- Modify: `tests/session-start.test.js` (if references removed functions)

**Step 1: Rewrite session-end.js**

```javascript
#!/usr/bin/env node
import { parseTranscript, extractConversation } from '../transcript.js';
import { filterSensitiveData } from '../privacy.js';
import { extractSignals } from '../analyzer.js';
import { appendSignals } from '../signals.js';
import { ensureProjectDir } from '../project.js';
import { updateProjectContext } from '../context.js';
import { updateGlobalContext, pruneGlobalContext } from '../global-context.js';
import { debug } from '../debug.js';

async function main() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  const { transcript_path } = JSON.parse(input);
  debug(`session-end: transcript_path=${transcript_path}`);
  if (!transcript_path) process.exit(0);

  const messages = await parseTranscript(transcript_path);
  debug(`session-end: ${messages.length} messages parsed`);
  if (messages.length < 4) {
    debug('session-end: too few messages, skipping');
    process.exit(0);
  }

  const conversation = extractConversation(messages);
  if (conversation.length < 200) {
    debug(`session-end: conversation too short (${conversation.length} chars), skipping`);
    process.exit(0);
  }
  const filtered = filterSensitiveData(conversation);
  debug(`session-end: analyzing ${filtered.length} chars`);

  const { reasoningGaps, context, userLanguage } = await extractSignals(filtered);
  debug(`session-end: extracted ${reasoningGaps.length} reasoning gaps, context=${context ? 'yes' : 'null'}`);

  if (reasoningGaps.length > 0) {
    await appendSignals(transcript_path, reasoningGaps, context);
    debug(`session-end: ${reasoningGaps.length} reasoning gaps saved to signals.jsonl`);
  }

  if (context) {
    const projectPath = process.cwd();
    const projectDir = await ensureProjectDir(projectPath);
    await updateProjectContext(projectDir, {
      decisions: context.decisions || [],
      open_questions: context.open_questions || [],
      summary: context.topics ? context.topics.join(', ') : null,
    });
    debug(`session-end: project context updated`);

    if (context.topics && context.topics.length > 0) {
      await updateGlobalContext(context.topics);
      await pruneGlobalContext();
      debug(`session-end: global context updated with ${context.topics.length} topics`);
    }
  }
}

main().catch((e) => {
  debug(`session-end: fatal error — ${e.message}\n${e.stack}`);
  console.log(JSON.stringify({ result: `your-taste: session-end error — ${e.message}` }));
  process.exit(0);
});
```

**Step 2: Delete legacy prompt**

Run: `rm prompts/analyze-session.md`

**Step 3: Remove analyzeTranscript from analyzer.js exports**

Ensure `analyzeTranscript` function and `parseAnalysisResponse` are fully removed (should be done in Task 2). Also remove `buildDimensionDesc` and `buildPendingSection` helper functions if they're only used by the legacy path.

**Step 4: Check for other references to analyzeTranscript**

Run: `grep -r "analyzeTranscript\|parseAnalysisResponse\|analyze-session" src/ tests/ --include="*.js" -l`

Fix any remaining references.

**Step 5: Run full test suite**

Run: `cd /Users/sen/ai/your-taste && npx vitest run --reporter=verbose 2>&1 | tail -40`
Expected: PASS

**Step 6: Commit**

```bash
git add -A && git commit -m "refactor: SessionEnd uses Stage 1 reasoning gap extraction

- Replace legacy analyzeTranscript() with extractSignals()
- Reasoning gaps saved to signals.jsonl (not proposals.jsonl)
- Delete analyze-session.md prompt
- Unified pipeline: both taste init and SessionEnd use same extraction"
```

---

### Task 10: Update backfill.js for reasoning gaps

**Files:**
- Modify: `src/backfill.js`

**Step 1: Check backfill.js references to old format**

The `backfill.js` already uses `extractSignals` and `appendSignals`. Update it to use the new field names:

- Change any reference to `decisionPoints` → `reasoningGaps`
- Change any reference to `decision_points` → `reasoning_gaps`
- Update log messages

**Step 2: Run backfill tests**

Run: `cd /Users/sen/ai/your-taste && npx vitest run tests/backfill.test.js --reporter=verbose 2>&1 | tail -20`
Expected: PASS

**Step 3: Commit**

```bash
git add src/backfill.js && git commit -m "refactor: backfill.js uses reasoning gaps format"
```

---

### Task 11: Clean up remaining references and run full suite

**Files:**
- Check all: `src/**/*.js`, `tests/**/*.js`

**Step 1: Search for stale references**

Run: `grep -rn "decision_points\|decisionPoints\|DIMENSION_NAMES\|dimensions\.js\|analyzeTranscript\|parseAnalysisResponse\|buildDimensionDesc\|thinkingPatterns\|extractThinkingPatterns" src/ tests/ --include="*.js" | grep -v "node_modules" | grep -v "// deprecated\|legacy\|backward"`

Fix any remaining stale references that aren't intentionally legacy-compat.

**Step 2: Run full test suite**

Run: `cd /Users/sen/ai/your-taste && npx vitest run --reporter=verbose 2>&1`
Expected: ALL PASS

**Step 3: Commit**

```bash
git add -A && git commit -m "chore: clean up stale references to old preference format"
```

---

### Task 12: Update README and product identity

**Files:**
- Rewrite: `README.md`

**Step 1: Read current README**

Read `README.md` to understand current structure.

**Step 2: Rewrite with new positioning**

Key changes:
- Lead with "thinking quality optimizer" positioning
- Core narrative: "Your corrections permanently upgrade how AI reasons about your problems"
- Remove preference/dimension terminology
- Update architecture diagram to show reasoning gap flow
- Update examples to show reasoning gaps instead of preference signals

**Step 3: Commit**

```bash
git add README.md && git commit -m "docs: rewrite README for thinking quality optimizer positioning"
```

---

### Task 13: Final integration verification

**Step 1: Run full test suite**

Run: `cd /Users/sen/ai/your-taste && npx vitest run --reporter=verbose 2>&1`
Expected: ALL PASS

**Step 2: Verify hook integration manually**

Run: `cd /Users/sen/ai/your-taste && echo '{}' | node src/hooks/session-start.js 2>&1`
Expected: No crash, outputs JSON result

Run: `cd /Users/sen/ai/your-taste && echo '{}' | node src/hooks/user-prompt.js 2>&1`
Expected: No crash, outputs JSON with additionalContext or "no context"

**Step 3: Final commit**

```bash
git add -A && git commit -m "feat: your-taste v1.0 — thinking quality optimizer

Reframes from preference learning to reasoning quality optimization.
AI corrections are reasoning failure signals, not preference data.
Evolved thinking framework replaces static personality profile."
```
