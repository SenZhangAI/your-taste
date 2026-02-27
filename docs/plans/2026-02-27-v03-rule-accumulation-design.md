# v0.3 Rule Accumulation System Design

> Graduate from template instructions to real accumulated rules. Users trust the system — they can see learning progress and correct mistakes.

## Scope

Four core features forming the rule accumulation pipeline:

1. **Rule Extraction** — extend Haiku prompt to output candidate behavioral rules
2. **pending.yaml Accumulation** — silent collection with dedup and occurrence counting
3. **`taste review` Skill** — interactive approval when rules reach threshold
4. **taste.md Generation + Injection** — approved rules become primary AI instruction source

## 1. Rule Extraction

### Approach: Extend Existing Prompt

No second API call. The existing `extract-preferences.md` prompt is extended to also output `candidate_rules` alongside dimension signals.

### Extended Output Format

```json
{
  "signals": [...],
  "candidate_rules": [
    "Clean breaks over gradual migration",
    "Naming > comments"
  ],
  "session_quality": "high"
}
```

### Prompt Additions

Added to `prompts/extract-preferences.md`:

```
## Behavioral Rules

Extract concrete behavioral rules or design principles the user demonstrates.

Rules should be:
- Short, actionable statements ("X over Y", "Always X", "Never Y")
- Abstract — no business details, code, or names
- Genuinely instructive — useful for guiding AI behavior in future sessions

Only extract rules the user strongly or repeatedly demonstrates. Not every preference is a rule.

{{PENDING_RULES}}
```

### Dedup via Prompt Injection

Before calling Haiku, inject existing pending rules into the prompt:

```
If a candidate rule is semantically equivalent to an existing pending rule below,
use the EXACT text of the existing rule instead of generating new wording.

Existing pending rules:
- "Clean breaks over gradual migration"
- "Delete dead code completely"
```

This leverages Haiku's semantic understanding for dedup at zero extra cost.

### Changes to analyzer.js

- `analyzeTranscript(conversationText, pendingRules?)` — accepts optional pending rules for prompt injection
- `parseResponse()` — extract both `signals` and `candidate_rules` from response
- Return type becomes `{ signals, rules }` instead of just signals array

## 2. pending.yaml Accumulation

### File: `src/pending.js`

### Storage Format

```yaml
rules:
  - text: "Clean breaks over gradual migration"
    count: 3
    first_seen: "2026-02-20"
    last_seen: "2026-02-27"
  - text: "Delete dead code completely"
    count: 1
    first_seen: "2026-02-27"
    last_seen: "2026-02-27"
```

Lives at `~/.your-taste/pending.yaml` alongside `profile.yaml`.

### Accumulation Logic

```
For each candidate_rule from Haiku:
  if exact text match in pending.yaml:
    count++, update last_seen
  else:
    add new entry with count=1
```

Exact match is sufficient because the prompt injection strategy causes Haiku to reuse existing rule text for semantic duplicates.

### Functions

- `readPending()` — read pending.yaml, return `{ rules: [] }` if missing
- `updatePending(pending, newRules)` — accumulate new rules, return updated pending
- `removePendingRules(pending, texts)` — remove dismissed rules by text
- `getPendingRuleTexts(pending)` — return array of rule texts for prompt injection

## 3. `taste review` Skill

### File: `skills/review/SKILL.md`

Registered as `/your-taste:review`. This is a Skill (not CLI) because approval is interactive and conversational.

### Skill Behavior

The skill instructs Claude to:

1. Run `node ${CLAUDE_PLUGIN_ROOT}/bin/cli.js review-data` to get pending rules as JSON
2. Filter rules with count >= 3 (review threshold)
3. If none qualify, tell user their rules are still accumulating
4. For each qualifying rule, present to user with occurrence count and date range
5. Ask user to Accept, Edit, or Dismiss each rule
6. Collect decisions, then run `node ${CLAUDE_PLUGIN_ROOT}/bin/cli.js review-apply` with decisions as stdin JSON

### CLI Support Commands

`bin/cli.js` gets two new subcommands for the skill to call:

- `taste review-data` — outputs pending rules as JSON to stdout (machine-readable)
- `taste review-apply` — reads decisions JSON from stdin, updates pending.yaml and taste.md

Decisions format (stdin to review-apply):
```json
{
  "accepted": ["Clean breaks over gradual migration", "Naming > comments"],
  "edited": [{"original": "Delete old code", "revised": "Delete dead code completely"}],
  "dismissed": ["Some noisy rule"]
}
```

### Threshold

Rules need count >= 3 to surface for review. This filters noise and ensures the rule reflects a real pattern, not a one-time preference.

## 4. taste.md Generation + Injection

### File: `src/taste-file.js`

### Format

```markdown
# Your Taste

- Clean breaks over gradual migration
- Naming > comments. If you need a comment, the name is wrong.
- Delete dead code completely
- Quality first. Don't cut corners on correctness.
```

Human-readable, user-editable. Manual edits and auto-approved rules coexist.

### Functions

- `readTasteFile()` — read taste.md, return null if missing or empty
- `appendRules(rules)` — append new approved rules to taste.md, creating file if needed
- `getTasteFilePath()` — returns `~/.your-taste/taste.md`

### Injection Logic Change

`session-start.js` updated:

```
1. Read taste.md
2. If taste.md has content → inject taste.md + quality floor
3. Else → fall back to template rendering (v0.2 behavior)
```

taste.md replaces template rendering when it has content. As more rules accumulate and get approved, they gradually take over from templates.

## Data Flow

```
SessionEnd:
  transcript → Haiku(prompt + pending rules) → { signals, candidate_rules }
                                                    ↓              ↓
                                              updateProfile   updatePending
                                                    ↓              ↓
                                              profile.yaml    pending.yaml

User runs /your-taste:review:
  pending.yaml → filter count>=3 → show to user → decisions
                                                       ↓
                                           accepted → taste.md
                                           dismissed → remove from pending

SessionStart:
  taste.md exists? → inject taste.md content
  else             → inject rendered template instructions (v0.2 fallback)
```

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `prompts/extract-preferences.md` | Modify | Add candidate_rules extraction + pending rules injection |
| `src/analyzer.js` | Modify | Accept pending rules, parse candidate_rules from response |
| `src/pending.js` | Create | pending.yaml read/write/accumulate |
| `src/taste-file.js` | Create | taste.md read/write/append |
| `src/hooks/session-end.js` | Modify | Call rule accumulation after profile update |
| `src/hooks/session-start.js` | Modify | taste.md-first injection with template fallback |
| `bin/cli.js` | Modify | Add review-data and review-apply subcommands |
| `skills/review/SKILL.md` | Create | /your-taste:review interactive approval |

## What's NOT in Scope

- evidence.jsonl (v0.3 later)
- `taste adjust` / `taste note` (v0.3 later)
- Milestone notifications (v0.3 later)
- Time decay (v0.3 later)
