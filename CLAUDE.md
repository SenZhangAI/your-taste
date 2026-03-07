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
- **thinking-context.md** (`~/.your-taste/`) — the final injectable document (WYSIWYG). Base framework + user-evolved checkpoints/patterns. Injected every turn by UserPromptSubmit hook.
- **base-thinking.md** (`prompts/`) — universal reasoning baseline. Cold-start fallback when thinking-context.md doesn't exist yet.
- **observations.md** (`~/.your-taste/`) — Stage 2 intermediate analysis. NOT directly injected. Input to Stage 3 synthesis.
- **signals.jsonl** — accumulated reasoning gap data from sessions

### Two-Layer Injection
1. **SessionStart** (once) — project context + triggers Stage 3 re-synthesis if observations changed
2. **UserPromptSubmit** (every message) — thinking-context.md (evolved) or base-thinking.md (cold start) + project/global context

### Evolution Pipeline
- **Stage 1** (SessionEnd): extract reasoning gaps → signals.jsonl
- **Stage 2** (taste insights): synthesize signals → observations.md
- **Stage 3** (SessionStart): merge base-thinking.md + observations.md → thinking-context.md
- **thinking-context.md** uses `<!-- your-taste:start/end -->` tags to mark the continuously-evolving portion

## Critical Design Constraint: Infer A, Not C

Users think A → B → C then say C. When extracting reasoning gaps:
- **Extract the missing reasoning step**, not the surface correction
- Example: user corrects a join query → the gap is NOT "user prefers verified joins" → the gap IS "AI skipped FK validation before writing code"
- The extract prompt must ask: what step did AI skip? Why did the reasoning break?

## TODO
- [ ] Preference capture pipeline (currently manual via CLAUDE.md, design automated path after reasoning quality is proven)
