# your-taste v1.0: Thinking Quality Redesign

## Decision: Why This Redesign

**Problem**: your-taste was designed as a preference learner — "learn what the user likes, personalize AI behavior." But the #1 user pain point isn't personalization, it's AI reasoning quality. Knowing a user prefers speed doesn't make AI think better.

**Insight**: User corrections are not preference signals — they're reasoning failure signals. "Use CardTradeV2DO" isn't a preference; it's "AI skipped FK validation before writing code." The extraction lens was wrong.

**New direction**: Capture reasoning breakdowns → evolve a thinking framework calibrated to the user's problem domain. Preferences become a secondary layer (TODO for future iteration).

## Architecture: What Changes

### Stage 1 — Extract Reasoning Gaps (was: Extract Decision Points)

**Old prompt focus**: "What did the user correct? What preference dimension does this map to?"
**New prompt focus**: "Where did AI's reasoning break? What step was missing?"

Old output:
```json
{
  "decision_points": [{
    "ai_proposed": "...", "user_reacted": "...",
    "dimension": "risk_tolerance", "principle": "..."
  }]
}
```

New output:
```json
{
  "reasoning_gaps": [{
    "what_ai_did": "Accepted user's guess about CardAuthDO without verifying",
    "what_broke": "User's guess was a hypothesis, AI treated it as fact",
    "missing_step": "Trace FK field's actual values and population path before implementing",
    "checkpoint": "When joining tables, verify the join key's actual semantics first",
    "category": "verification_skip"
  }],
  "session_context": { "topics": [], "decisions": [], "open_questions": [] },
  "session_quality": "high|medium|low|none",
  "user_language": "zh"
}
```

Reasoning gap categories (replace 6 preference dimensions):

| Category | What broke | Example |
|----------|-----------|---------|
| `verification_skip` | Didn't verify before acting | Accepted hypothesis as fact, asserted without reading code |
| `breadth_miss` | Didn't scan adjacent implications | Fixed pointed-out issue without checking related assumptions |
| `depth_skip` | Stopped at surface, didn't trace root | Responded to C without tracing to A |
| `assumption_leak` | Hidden assumption not identified | Treated casual input as specification |
| `overreach` | Over-extended scope or complexity | Full-chain analysis when user wanted a targeted fix |

### Stage 2 — Synthesize Thinking Framework (was: Synthesize Profile)

**Old output**: observations.md with Thinking Patterns + Working Principles + Suggested Rules + Common Misreads
**New output**: observations.md with three sections focused on reasoning quality

```markdown
## Reasoning Checkpoints
Verification steps AI must take before acting. Extracted from historical reasoning failures.
Auto-evolving (low risk).

- **Checkpoint name**: trigger condition → verification step → why this matters
  (N sessions, category)

## Domain Reasoning
How to reason correctly in specific problem domains. Not preferences — domain-specific thinking rules.
Needs user review before activation (high impact).

- **Rule name** (N sessions)
  General principle → concrete application in context
  Evidence: specific examples

## Failure Patterns
AI's recurring reasoning errors. Highest-value preventive content.
Auto-evolving (low risk).

- **Pattern**: what AI did → what should have happened → root cause
```

What was removed:
- **Suggested Rules** — checkpoints ARE the rules, no need for a separate suggestion layer
- **Thinking Patterns** (as "how user thinks") — reframed as Reasoning Checkpoints (what AI should do)
- **Working Principles** (as "user preferences") — reframed as Domain Reasoning (how to think in this domain)

### SessionEnd — Unified Pipeline

**Old**: SessionEnd used legacy `analyze-session.md` with dimension scoring → proposals.jsonl
**New**: SessionEnd uses Stage 1 reasoning gap extraction → signals.jsonl

Remove:
- `analyze-session.md` prompt
- `dimensions.js` (6 preference dimensions)
- Dimension scoring logic in `analyzer.js`

Keep:
- `proposals.jsonl` (dormant, reserved for future preference pipeline)
- `context.js` / `global-context.js` (project + cross-project context, unchanged)

### Injection Architecture

| Hook | What's injected | Priority |
|------|----------------|----------|
| **CLAUDE.md** (native) | Confirmed behavioral rules (`your-taste:start/end` section) | P0 |
| **SessionStart** (once) | Domain Reasoning + Failure Patterns from observations.md | P1 |
| **UserPromptSubmit** (every msg) | Reasoning Checkpoints (4KB budget) | P1 |
| **UserPromptSubmit** | Project context | P2 |
| **UserPromptSubmit** | Global context | P3 |

Key change: `thinking-framework.md` is bootstrap only. When observations.md has 3+ Reasoning Checkpoints, the static template is no longer injected — replaced by the evolved content.

### Evolution Mechanism (Hybrid)

| Content | Evolution | Rationale |
|---------|-----------|-----------|
| Reasoning Checkpoints | Auto-evolve | Low risk, purely additive verification steps |
| Failure Patterns | Auto-evolve | Preventive, doesn't change behavior direction |
| Domain Reasoning | Needs review | High impact, could change how AI approaches problems |

Trigger: after N new sessions with reasoning gaps accumulated in signals.jsonl, auto-run Stage 2 to re-synthesize observations.md. Domain Reasoning changes are flagged for review.

## What's Removed

- `dimensions.js` — 6 preference dimensions (risk_tolerance, complexity_preference, etc.)
- `analyze-session.md` — legacy single-pass prompt
- `profile.yaml` — already deprecated
- `taste.md` — already removed
- Personality narratives / dimension scoring
- "Taste vs Skill" distinction — no longer extracting preferences

## What's Preserved

- Two-stage pipeline architecture (Stage 1 extract + Stage 2 synthesize)
- observations.md as core output file
- Three-layer injection (CLAUDE.md + SessionStart + UserPromptSubmit)
- taste review workflow (repurposed for Domain Reasoning review)
- Project context + global context tracking
- Multi-provider LLM abstraction
- Privacy filtering

## Storage

```
~/.your-taste/
├── observations.md    # Evolved thinking framework (3 sections)
├── signals.jsonl      # Accumulated reasoning gaps from sessions
├── proposals.jsonl    # Reserved for future preference pipeline
├── config.yaml        # Configuration
├── projects/          # Per-project context
└── global-context.md  # Cross-project awareness
```

## TODO

- [ ] Preference capture pipeline — design automated path after reasoning quality pipeline is proven
- [x] Contextual checkpoint weighting — resolved via task-type-aware breadth rules in synthesis prompt (A/B test finding: breadth_miss is the only effective differentiator)
- [ ] Cross-session pattern validation — verify reasoning checkpoint effectiveness over time
- [ ] 3-hop reasoning chain mechanism — Case 6 (verify claim → where else is this queried → trace service layer) is beyond single-checkpoint reach, needs a different mechanism

## Product Identity

Name stays **your-taste**. Reinterpret: "your taste in AI reasoning quality" — your standards for how AI should think.

Core narrative for README:
> Your corrections don't just fix today's mistake — they permanently upgrade how AI reasons about your problems. your-taste captures where AI reasoning breaks down, and evolves a thinking framework calibrated to your problem domain.
