# v0.2 P0 Trio Design — Instruction Renderer + Backfill + additionalContext

> Make users feel the AI actually behaves differently after installing your-taste.

## Scope

Three P0 features that form the minimum value loop:

1. **Instruction Renderer** — translates profile scores into concrete behavioral directives
2. **Backfill Init** (`taste init`) — scans past sessions to build instant profile
3. **additionalContext Injection** — SessionStart hook delivers rendered instructions to AI

Together they close the gap: backfill provides data → renderer produces directives → injection delivers them to AI every session.

## 1. Instruction Renderer

### File: `src/instruction-renderer.js`

Takes a profile object, returns a string of behavioral directives (or null if nothing to say).

### Template structure

Each dimension has instruction variants mapped to score ranges:

```js
const TEMPLATES = {
  risk_tolerance: [
    {
      range: [0.0, 0.35],
      instruction: "Prefer gradual migration over rewrites. Include rollback plans for production changes. Favor proven patterns over novel approaches."
    },
    {
      range: [0.65, 1.0],
      instruction: "Prefer clean rewrites over patching. Skip backward compatibility unless there's a running production dependency. Favor decisive action."
    },
  ],
  // ... each dimension gets 2-4 variants
};
```

### Rendering rules

- Mid-range scores (0.35-0.65) produce no instruction — respect ambiguous preferences
- Confidence < 0.3 produces no instruction — not enough evidence
- Output is plain text, one instruction block per active dimension
- Prefixed with a brief context line explaining what this is

### Output format

```
This developer's working style preferences (learned from past sessions):

- Prefer clean rewrites over patching. Skip backward compatibility unless there's a running production dependency.
- Keep responses brief and action-oriented. Lead with the answer, skip lengthy explanations.
- Quality first. Don't cut corners on correctness or code clarity to save time.

Apply these preferences on top of professional best practices. Never compromise error handling, security, or data integrity.
```

The quality floor (last line) is always appended regardless of scores.

### Testability

Pure function: `renderInstructions(profile) → string | null`. No side effects, no API calls. Fully unit-testable.

## 2. Backfill Init (`taste init`)

### Files: `src/backfill.js` + `bin/cli.js`

### Session discovery

Scan `~/.claude/projects/*/sessions/*/transcript.jsonl` for all historical session transcripts.

### Pipeline

Reuses existing modules — no new analysis logic:

```
For each transcript:
  1. parseTranscript(path)          — existing transcript.js
  2. extractConversation(messages)   — existing transcript.js
  3. filterSensitiveData(text)       — existing privacy.js
  4. analyzeTranscript(filtered)     — existing analyzer.js (Haiku call)
  5. Collect signals
```

Then aggregate all signals into a single profile using existing Bayesian update.

### Concurrency

- Process 3 transcripts concurrently (avoid Haiku rate limits)
- Skip sessions with < 4 messages or < 200 chars conversation (existing thresholds)
- Show progress to stdout

### CLI entry point

`bin/cli.js` — registered in package.json as `"bin": { "taste": "./bin/cli.js" }`.

```
$ taste init
Scanning past sessions...
Found 34 sessions with decision content (12 skipped — too short).

Analyzing... ████████████░░░░ 22/34

Profile ready:
  risk_tolerance     ████████░░  0.74  bold       (12 sessions)
  communication      ███░░░░░░░  0.28  direct     (8 sessions)
  quality_vs_speed   ████████░░  0.82  quality    (15 sessions)
  complexity         ███░░░░░░░  0.32  minimalist (8 sessions)
  autonomy           ████████░░  0.81  autonomous (10 sessions)
  exploration        ██████░░░░  0.65  balanced   (6 sessions)

Run `taste show` for details.
```

### Idempotency

Running `taste init` twice overwrites the profile. Since it scans all history and rebuilds from scratch, this is safe and expected.

## 3. additionalContext Injection

### File: `src/hooks/session-start.js` (modified)

### Current behavior

Outputs a status line: `"your-taste: N preference dimensions learned"`

### New behavior

1. Read profile
2. Call `renderInstructions(profile)`
3. If instructions exist, output via `hookSpecificOutput.additionalContext`
4. Keep status line in `result` field

```js
const output = {
  result: `your-taste: ${activeDims.length} dimensions active`,
};

if (instructions) {
  output.hookSpecificOutput = {
    additionalContext: instructions,
  };
}

console.log(JSON.stringify(output));
```

The AI receives the rendered instructions at session start, invisible to the user. The status line remains visible as a subtle indicator.

## File changes summary

| File | Action | Description |
|------|--------|-------------|
| `src/instruction-renderer.js` | Create | Templates + rendering logic |
| `src/backfill.js` | Create | History scanning + batch analysis |
| `bin/cli.js` | Create | CLI entry point (`taste init`) |
| `src/hooks/session-start.js` | Modify | Add additionalContext output |
| `package.json` | Modify | Add `bin` field |

## What's NOT in scope

- `taste show` terminal visualization (P1)
- Personality Narrative Engine (P1)
- Quality floor as separate configurable system (hardcoded one-liner is enough)
- Time decay (v0.3)
- Rule accumulation / taste.md generation (v0.3)
