# Your Taste

## Core Purpose

Your-taste is a **context accelerator**, not just a preference tracker. The goal is not "understand the user" as an end — it's to **reduce the information gap between user and AI**, enabling faster autonomous collaboration.

Understanding taste is one means. The full picture includes:
- **Direction preferences** (cautious vs bold, minimal vs comprehensive)
- **Decision principles** (concrete rules extracted from repeated behavior)
- **Strategic context** (what the user is focused on, what was already decided)
- **Thinking patterns** (how users reason, so AI can predict intent)

## Architecture: Observations-Based Learning

### Data Flow
1. **taste init** (batch) — two-pass pipeline: extract decision points → synthesize observations.md
2. **SessionEnd** (incremental) — single-pass: extract strong signals → proposals.jsonl
3. **taste review** — user confirms proposals → writes to CLAUDE.md managed section

### Core Files
- **observations.md** — AI's working draft. Four sections:
  - Thinking Patterns — how the user reasons (abstract-first, traces full paths, etc.)
  - Working Principles — preferences with context conditions and motivation
  - Suggested Rules — candidate rules for review
  - Common Misreads — patterns AI gets wrong
- **proposals.jsonl** — pending rule suggestions awaiting user review
- **CLAUDE.md** (`<!-- your-taste:start/end -->`) — user-confirmed behavioral rules, consumed natively by Claude Code

### Three-Layer Injection
1. **CLAUDE.md** (native) — confirmed rules, read by Claude Code without hooks
2. **SessionStart** (once) — Working Principles + Common Misreads from observations, project context
3. **UserPromptSubmit** (every message) — thinking-framework.md + personalized Thinking Patterns + project context

### How to Apply Observations

Observations capture DIRECTION and REASONING STYLE, not skill level. Two rules:

1. **Match their direction** — if they prefer cautious approaches, favor gradual migrations. If they prefer minimal code, avoid over-abstraction.

2. **Exceed their skill level** — always execute at professional best-practice quality. A "cautious" user gets expert-level caution (migration strategies, canary deploys), not amateur caution (try-catch everywhere).

## Critical Design Constraint: Infer A, Not C

Users think A → B → C then say C. When extracting preferences from behavior:
- **Extract the underlying principle (A)**, not the surface action (C)
- Example: user gives specific numeric counterexample → A is "systematic thinker who traces full paths", NOT "prefers concrete over abstract"
- Behavioral signals reveal direction but can mislead about motivation
- The extract prompt must always ask WHY, not just WHAT
