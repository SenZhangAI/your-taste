# v0.4 Design: Context Accelerator

> Approved 2026-02-28. Transforms your-taste from preference tracker to context accelerator.
> Core shift: from "AI knows your style" to "AI knows your style + what you're working on + how to think about your messages."

## Product Repositioning

**Old**: AI learns decision-making style → personalized behavior
**New**: AI becomes a more effective collaborator by:
1. Understanding real intent (A), not surface expression (C)
2. Holding strategic context (current focus, decisions, open questions)
3. Applying structured thinking frameworks per message
4. Managing its own context limitations proactively

The existing v0.3 system (dimensions + rules + taste.md) remains unchanged. v0.4 adds a context layer on top.

## Architecture

```
                    ┌─────────────────┐
                    │   Haiku LLM     │
                    └────────┬────────┘
                             │ extracts
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
         signals[]     candidate_rules[]  session_context{}  ← NEW
              │              │              │
              ▼              ▼              ▼
        profile.yaml   pending.yaml    context.yaml          ← NEW
              │              │              │
              └──────────────┼──────────────┘
                             │ read at
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        SessionStart    SessionStart    UserPromptSubmit      ← NEW
        (taste.md +     (context)       (context +
         templates)                      thinking framework)
```

**Three new components**, each with clear boundaries:

| Component | File(s) | Purpose |
|-----------|---------|---------|
| Context Storage | `src/context.js`, `~/.your-taste/context.yaml` | Read/write/decay strategic context |
| SessionEnd Enhancement | `analyzer.js`, `session-end.js`, `extract-preferences.md` | Extract session_context from conversations |
| UserPromptSubmit Hook | `src/hooks/user-prompt.js`, `prompts/thinking-framework.md` | Per-message injection of context + thinking framework |

### Design Decisions

**Why context.yaml, not context.md**: Machine-written structured data uses YAML (consistent with profile.yaml, pending.yaml). Human-authored instructions use .md (consistent with taste.md). Context is auto-extracted and auto-decayed — it's machine data.

**SessionStart vs UserPromptSubmit — no overlap**:
- SessionStart injects: taste.md + quality floor (static style, once per session)
- UserPromptSubmit injects: thinking framework + context.yaml (dynamic context, every message)

**No LLM call in UserPromptSubmit**: Pure file read + template assembly. Target latency <200ms. The 5s timeout is safety margin only.

**4-layer conceptual model collapsed to 3 components**: The upgrade plan's Layers 1 (Intent Inference), 3 (Elevated Cognition), and 4 (Context Self-Management) are all content sections within the thinking-framework.md template, not separate code paths. Layer 2 (Strategic Context) is the only architecturally distinct addition.

## Component 1: Context Storage

### File: `~/.your-taste/context.yaml`

```yaml
version: 1
focus:
  - date: "2026-02-28"
    text: "your-taste repositioning as context accelerator"
decisions:
  - date: "2026-02-28"
    text: "Use claude -p for auth, no separate API key"
open_questions:
  - date: "2026-02-28"
    text: "Cross-project context handling strategy"
```

### Module: `src/context.js`

```javascript
loadContext()        → { focus: [], decisions: [], open_questions: [] }
updateContext(ctx)   → merge new entries, deduplicate by exact text match
pruneContext()       → remove expired entries by section-specific TTL
renderContext()      → formatted text for additionalContext injection
```

### Constraints

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| focus TTL | 30 days | Work focus changes fast |
| decisions TTL | 90 days | Decisions are more durable |
| open_questions TTL | 60 days | Unresolved for 2 months = probably dropped |
| focus max entries | 10 | Prevents unbounded growth |
| decisions max entries | 15 | Slightly more accumulation allowed |
| open_questions max entries | 5 | Keeps focus sharp |
| Deduplication | Exact text match | Simple, reliable. Semantic dedup too complex for v0.4 |

### Rendered Output (for injection)

```markdown
## Active Context

### Recent Focus
- [Feb 28] your-taste repositioning as context accelerator
- [Feb 27] v0.3 rule accumulation system completed

### Key Decisions
- Use claude -p for auth, no separate API key
- Default scan 50 sessions, --all for full scan

### Open Questions
- Cross-project context handling strategy
```

Dates in short format (Feb 28). Decisions omit dates (the decision itself matters more than when). Empty sections not rendered.

## Component 2: SessionEnd Enhancement

### Prompt Addition (extract-preferences.md)

New section after "Behavioral Rules":

```markdown
## Session Context Extraction

Beyond preference signals, extract the STRATEGIC CONTEXT of this conversation:

- **topics**: What major subjects were discussed? (1-3 items, abstract level only)
- **decisions**: What was explicitly decided? Only clear decisions, not preferences.
- **open_questions**: What was raised but left unresolved?

Keep entries concise (max 15 words each). Focus on strategic direction, not implementation details.
No code, no variable names, no file paths — just the strategic what and why.
```

### Output Format Extension

```json
{
  "signals": [...],
  "candidate_rules": [...],
  "session_quality": "high",
  "session_context": {
    "topics": ["your-taste product repositioning"],
    "decisions": ["v0.4 scope: context.md + UserPromptSubmit"],
    "open_questions": ["additionalContext size limits"]
  }
}
```

### Code Changes

**analyzer.js**: `parseAnalysisResponse()` extracts `session_context` field. Returns `{ signals, rules, context }`. Context is null when absent (backward compatible — Haiku may not output it initially).

**session-end.js**: After profile + pending updates, calls `updateContext(context)` then `pruneContext()`. Same error handling pattern — never blocks session exit.

**Key constraint**: session_context shares the single Haiku call with signals and rules. No additional LLM cost.

## Component 3: UserPromptSubmit Hook

### Registration (hooks/hooks.json)

```json
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
```

### Handler: `src/hooks/user-prompt.js`

1. Read `context.yaml` → render to text
2. Read `prompts/thinking-framework.md` → thinking instructions
3. Assemble additionalContext: `[framework, contextText].filter(Boolean).join('\n\n')`
4. Size guard: if total > 4000 chars, drop context (keep framework — it's more valuable)
5. Output JSON with `hookSpecificOutput.additionalContext`
6. Silent failure (exit 0 on error)

### Size Budget

| Section | Estimated Size |
|---------|---------------|
| Thinking framework | ~800 chars (fixed) |
| Context render | ~1500 chars max (capped by entry limits) |
| **Total** | **~2300 chars typical, 4000 hard cap** |

Framework takes priority over context when space is constrained.

## Component 4: Thinking Framework Template

### File: `prompts/thinking-framework.md`

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

This template is static in v0.4. It encodes the A→B→C theory as actionable instructions. Future iterations can personalize it based on taste profile.

## Component 5: SessionStart Enhancement

Minimal change to `src/hooks/session-start.js`:

```javascript
// Also inject context alongside taste.md
const contextText = renderContext(await loadContext());
const baseContext = buildAdditionalContext(profile, tasteContent);
const additionalContext = contextText
  ? `${baseContext}\n\n${contextText}`
  : baseContext;
```

This ensures context is available even without UserPromptSubmit support. The UserPromptSubmit injection is additive (refreshes context per message), not a replacement.

## File Changes Summary

| File | Type | Change |
|------|------|--------|
| `src/context.js` | NEW | context.yaml CRUD + time decay + render |
| `src/hooks/user-prompt.js` | NEW | UserPromptSubmit handler |
| `prompts/thinking-framework.md` | NEW | Thinking framework template |
| `prompts/extract-preferences.md` | MODIFY | Add session_context extraction instructions |
| `src/analyzer.js` | MODIFY | Parse session_context field |
| `src/hooks/session-end.js` | MODIFY | Call updateContext + pruneContext |
| `src/hooks/session-start.js` | MODIFY | Inject context alongside taste.md |
| `hooks/hooks.json` | MODIFY | Register UserPromptSubmit hook |
| `tests/context.test.js` | NEW | Context CRUD/decay/render tests |
| `tests/user-prompt.test.js` | NEW | UserPromptSubmit handler tests |
| `tests/analyzer.test.js` | MODIFY | session_context parsing tests |
| `tests/session-start.test.js` | MODIFY | Context injection tests |

## Testing Strategy

**New test files:**
- `tests/context.test.js` — CRUD operations, time decay (mock dates), entry limits, render output, empty state handling
- `tests/user-prompt.test.js` — Hook output format, size guard, missing files, silent failure

**Existing test updates:**
- `tests/analyzer.test.js` — Verify session_context parsing, null/missing context handling
- `tests/session-start.test.js` — Verify context injection alongside taste.md

**Integration:** End-to-end test: SessionEnd extracts context → writes context.yaml → SessionStart reads and injects → UserPromptSubmit reads and injects with framework.

## Deferred to Future Iterations

These items are explicitly NOT in v0.4 scope. They require v0.4 validation data before design.

### Near-term (v0.4.1 — post-validation polish)

| Item | Why Deferred | Prerequisite |
|------|-------------|--------------|
| **A→C few-shot examples** in extract-preferences.md | Need real misattribution data from v0.4 context extraction runs | Run v0.4 for 2+ weeks, collect actual Haiku outputs |
| **Misattribution detection** mechanism | Can't design without knowing what Haiku actually gets wrong | Same as above — need error patterns |
| **Thinking framework personalization** | Static template may already be sufficient. Need A/B comparison data | Run v0.4, compare sessions with/without framework |

### Medium-term (v0.5)

| Item | Why Deferred | Prerequisite |
|------|-------------|--------------|
| **Cross-project context** handling | Single-project value must be validated first. Cross-project adds complexity (project-scoped vs global context, merge strategies) | v0.4 proves context extraction quality on single project |
| **`taste init` context extraction** | Backfill sessions are historical — context freshness is low. Focus on live session extraction first | v0.4 SessionEnd extraction working well |
| **Dynamic context size budgeting** | Need real data on additionalContext limits and optimal injection size | Run v0.4, measure actual context sizes and AI response quality |

### Long-term (v0.6+)

| Item | Why Deferred | Prerequisite |
|------|-------------|--------------|
| **Semantic deduplication** for context entries | Exact match is sufficient for v0.4. Semantic dedup needs embedding model or LLM call — adds cost and latency | Volume of context entries growing to point where exact match causes bloat |
| **Context importance scoring** | All entries currently equal weight. Importance scoring needs signal data | Enough context entries to observe which ones AI actually uses |
| **UserPromptSubmit as learning point** | Currently read-only (injects context). Could also observe user corrections in real-time | v0.4 intent inference validated, ready for real-time learning loop |

### Design Questions to Validate During v0.4

These are not deferred features but open questions that v0.4 runtime data will answer:

1. **additionalContext effective size**: Is 4000 chars enough? Too much? Does AI behavior degrade with injection size?
2. **UserPromptSubmit latency**: Is file I/O on every message noticeable to users?
3. **Haiku session_context quality**: Does Haiku extract useful strategic context or noise?
4. **Thinking framework effectiveness**: Does injecting the framework actually change AI behavior?
5. **Context decay rates**: Are 30/60/90 day windows right, or do they need adjustment?

Track these questions as observations during v0.4 usage. Adjust parameters based on evidence.
