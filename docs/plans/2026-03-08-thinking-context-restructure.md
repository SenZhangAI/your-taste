# Thinking Context Restructure

## Problem

The current injection architecture has overlapping responsibilities and a hidden override:

1. `observations.md` Reasoning Checkpoints overrides `thinking-framework.md` silently — the Core Reasoning Loop (Infer A from C, first principles, scan before moving forward) added to `thinking-framework.md` never gets injected because `observations.md` takes priority.
2. `CLAUDE.md` your-taste section duplicates content also injected via hooks, creating dual maintenance burden.
3. `thinking-framework.md` has ambiguous identity — cold-start template that was manually evolved into a core framework.
4. No Stage 3 to merge base framework + user-evolved rules into a single injectable document.

## Design Principles (from A/B testing)

1. **Abstract rules > domain-specific cases** — abstract principles work, domain cases anchor to wrong contexts
2. **Examples disambiguate, not execute** — examples clarify concept boundaries, not provide execution paths
3. **Document top = highest salience** — structure flip improved pass rate from 55% to 75%
4. **Concise > verbose** — ~6K chars optimal injection size
5. **Activation words** — terms like "first principles" may trigger higher-quality reasoning
6. **Repeated injection via UserPromptSubmit** — per-turn injection keeps checkpoints salient as conversation grows
7. **`-p` mode limitation** — breadth_miss cannot be solved via injection in single-turn mode

## Architecture

### File Layout

```
prompts/
  base-thinking.md              # Universal baseline (renamed from thinking-framework.md)
  synthesize-thinking.md        # Stage 3 prompt: base + observations → thinking-context.md

~/.your-taste/
  signals.jsonl                 # Stage 1: raw reasoning gaps
  observations.md               # Stage 2: intermediate analysis (NOT injected)
  thinking-context.md           # Stage 3: final injectable document (WYSIWYG)
  projects/                     # Per-project context
  global-context.yaml           # Cross-project awareness
```

### thinking-context.md Structure

```markdown
## Reasoning Checkpoints

### Core Reasoning Loop
- **Infer A from C.** ...
- **Enumerate from first principles.** ...
- **Scan before moving forward.** ...

- **Breadth-scan after completing a unit.** ...
- **Verify before executing.** ...
- (other base checkpoints)

<!-- your-taste:start -->
### Evolved Checkpoints
- (user-specific checkpoints synthesized from observations)

### Failure Patterns
- (user-specific failure patterns from observations)
<!-- your-taste:end -->
```

The `<!-- your-taste:start/end -->` tags mark the continuously-evolving portion. Content outside the tags comes from `base-thinking.md` and is stable.

### Hook Responsibilities

| Hook | Responsibility | Reads |
|------|---------------|-------|
| **SessionStart** | 1. Detect observations change → trigger Stage 3 re-synthesis | observations.md mtime vs thinking-context.md mtime |
| | 2. Inject project context (one-time per session) | project context |
| | 3. Check pending proposals | proposals |
| **UserPromptSubmit** | Inject thinking-context.md (fallback → base-thinking.md) | thinking-context.md, project/global context |
| **SessionEnd** | Analyze conversation → signals + context update | transcript |

### Cold Start Flow

```
Install your-taste
  → ~/.your-taste/ empty
  → thinking-context.md does NOT exist
  → UserPromptSubmit falls back to base-thinking.md
  → SessionEnd accumulates signals → Stage 2 generates observations
  → Next SessionStart detects observations → triggers Stage 3
  → Stage 3 merges base-thinking.md + observations → thinking-context.md
  → Subsequent UserPromptSubmit injects thinking-context.md (evolved)
```

Zero configuration required. Users never touch any file.

### Stage 3 Trigger Logic

SessionStart checks:
- `observations.md` mtime > `thinking-context.md` mtime → re-synthesize
- `thinking-context.md` does not exist AND `observations.md` exists → first synthesis

### Stage 3 Synthesis Rules (for synthesize-thinking.md prompt)

Based on DESIGN-PRINCIPLES:
1. Extract only abstract rules from observations — discard domain-specific details
2. Add disambiguating examples only when rules are too abstract (task-type patterns, not domain cases)
3. Total output ≤ 4000 chars (UserPromptSubmit MAX_CHARS budget)
4. Core Reasoning Loop at document top (highest salience position)
5. Use activation words: "first principles", "breadth-scan", "verify before trusting"
6. Mark evolved content with `<!-- your-taste:start/end -->` tags

### CLAUDE.md Changes

Remove `<!-- your-taste:start -->` to `<!-- your-taste:end -->` section entirely. CLAUDE.md retains only user profile/persona. All thinking/reasoning injection handled 100% by hooks.

Rationale:
1. Simulates real users who don't maintain CLAUDE.md
2. Eliminates dual maintenance between CLAUDE.md and thinking-context.md
3. Single source of truth for reasoning rules

## Code Changes Required

1. **Rename** `prompts/thinking-framework.md` → `prompts/base-thinking.md`
2. **Create** `prompts/synthesize-thinking.md` (Stage 3 LLM prompt)
3. **Modify** `src/hooks/user-prompt.js`:
   - Read `~/.your-taste/thinking-context.md` first
   - Fallback to `prompts/base-thinking.md` if not found
   - Remove `extractReasoningCheckpoints(observations)` logic
4. **Modify** `src/hooks/session-start.js`:
   - Add mtime comparison: observations vs thinking-context
   - Trigger Stage 3 synthesis when observations newer
   - Remove observations rendering from SessionStart injection (no longer injects Domain Reasoning / Failure Patterns — those go into thinking-context.md)
5. **Create** Stage 3 synthesis function (reads base-thinking + observations, calls LLM, writes thinking-context.md)
6. **Update** `src/observations.js` — `extractReasoningCheckpoints` may be repurposed or removed
7. **Remove** CLAUDE.md your-taste section

## Migration

For existing users (Sen):
1. Backup current files (done: `discuss/backups/2026-03-08-pre-restructure/`)
2. Run Stage 3 once manually to generate initial thinking-context.md from current observations
3. Remove CLAUDE.md your-taste section
4. Verify via A/B test that new architecture matches or exceeds current L2 performance

## Implementation Plan

### Task 1: Rename thinking-framework.md → base-thinking.md

**Files:**
- Rename: `prompts/thinking-framework.md` → `prompts/base-thinking.md`

Merge the best content from both CLAUDE.md your-taste section and current thinking-framework.md into base-thinking.md. The CLAUDE.md version has richer descriptions (e.g., "One correction should prevent an entire class of future mistakes") while thinking-framework.md has task-type-specific breadth patterns. Keep both.

### Task 2: Create synthesize-thinking.md (Stage 3 prompt)

**Files:**
- Create: `prompts/synthesize-thinking.md`

LLM prompt that takes base-thinking.md + observations.md → produces thinking-context.md. Must follow DESIGN-PRINCIPLES: abstract rules only, disambiguating examples, ≤4000 chars output, your-taste tags.

### Task 3: Modify user-prompt.js

**Files:**
- Modify: `src/hooks/user-prompt.js`

Replace observations → extractReasoningCheckpoints fallback logic with:
1. Read `~/.your-taste/thinking-context.md`
2. Fallback to `prompts/base-thinking.md`
3. Keep project/global context assembly unchanged

### Task 4: Modify session-start.js

**Files:**
- Modify: `src/hooks/session-start.js`

Replace observations rendering with:
1. Compare mtime: observations.md vs thinking-context.md
2. If observations newer → trigger Stage 3 synthesis
3. Keep project context injection and proposals check
4. Remove Domain Reasoning / Failure Patterns injection (moved to thinking-context.md)

### Task 5: Create Stage 3 synthesis function

**Files:**
- Create: `src/synthesize-thinking.js`

Reads base-thinking.md + observations.md, calls LLM via synthesize-thinking.md prompt, writes thinking-context.md.

### Task 6: Generate initial thinking-context.md

Run Stage 3 manually with current observations.md to generate the first thinking-context.md.

### Task 7: Remove CLAUDE.md your-taste section

**Files:**
- Modify: `~/.claude/CLAUDE.md`

Remove lines 1-25 (your-taste:start to your-taste:end) and the `---` separator.

### Task 8: Test

Run your-taste-test L2 and compare against baseline.

## Testing

Run your-taste-test L2 after implementation. Compare against:
- L2 baseline (20260307-180144): 14 PASS, 5 PARTIAL, 1 FAIL
- LW baseline (20260307-172711): 10 PASS, 6 PARTIAL, 4 FAIL
