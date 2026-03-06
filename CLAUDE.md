# Your Taste

## Product Direction — Decision Anchor

**Core metric: does this make AI smarter?** Every product decision, feature design, and architectural choice must be evaluated against this single question. If it doesn't make AI reasoning better, it doesn't ship.

Three pillars:
1. **Practical** — measurable improvement in AI reasoning quality, not theoretical elegance
2. **Continuously evolving** — each session's corrections permanently upgrade the thinking framework, not just fix one instance
3. **User value** — the user feels AI getting smarter over time, not just "personalized"

Preferences are secondary. Knowing the user wants speed doesn't make AI think better — it just adjusts direction. Thinking quality is the foundation; preferences are calibration on top.

## Core Purpose

Your-taste captures **AI reasoning failures** from collaboration and evolves a thinking framework that prevents them. The user's corrections are training signals — each one should permanently upgrade how AI reasons in this problem domain.

**Old framing (deprecated):** "Learn user preferences → personalize AI behavior"
**Current framing:** "Capture reasoning breakdowns → evolve AI thinking quality"

## Architecture: Reasoning Gap Learning

### Data Flow
1. **taste insights** (batch) — two-pass pipeline: extract reasoning gaps → synthesize thinking framework
2. **SessionEnd** (incremental) — extract reasoning gaps → accumulate signals
3. **Synthesis trigger** — after N new sessions, re-synthesize the evolved thinking framework

### Core Files
- **observations.md** — the evolved thinking framework. Three sections:
  - Reasoning Checkpoints — verification steps AI must take before acting (auto-evolving)
  - Domain Reasoning — how to reason correctly in specific problem domains (needs review)
  - Failure Patterns — AI's recurring reasoning errors to prevent (auto-evolving)
- **signals.jsonl** — accumulated reasoning gap data from sessions
- **CLAUDE.md** (`<!-- your-taste:start/end -->`) — user-confirmed behavioral rules, consumed natively by Claude Code

### Three-Layer Injection
1. **CLAUDE.md** (native) — confirmed rules, read by Claude Code without hooks
2. **SessionStart** (once) — Domain Reasoning + Failure Patterns from observations
3. **UserPromptSubmit** (every message) — Reasoning Checkpoints (evolved, replaces static thinking-framework.md when mature)

### Evolution Mechanism (Hybrid)
- **Reasoning Checkpoints** + **Failure Patterns**: auto-evolve (low risk, purely additive)
- **Domain Reasoning**: needs user review before activation (high impact, could change behavior direction)
- **thinking-framework.md**: bootstrap template for cold start, replaced by observations.md content once 3+ checkpoints accumulated

## Critical Design Constraint: Infer A, Not C

Users think A → B → C then say C. When extracting reasoning gaps:
- **Extract the missing reasoning step**, not the surface correction
- Example: user corrects a join query → the gap is NOT "user prefers verified joins" → the gap IS "AI skipped FK validation before writing code"
- The extract prompt must ask: what step did AI skip? Why did the reasoning break?

## TODO
- [ ] Preference capture pipeline (currently manual via CLAUDE.md, design automated path after reasoning quality is proven)
