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
1. **Session end** — analyzer extracts observations from conversation transcript
2. **observations.md** — primary output. Contains:
   - **Thinking Patterns** — how the user reasons (abstract-first, traces full paths, etc.)
   - **Behavioral Patterns** — preferences with context conditions (e.g. "prefers X when doing Y")
   - **Suggested Rules** — candidate rules awaiting user review
3. **taste.md** — user-reviewed rules promoted from Suggested Rules via `taste review`
4. **profile.yaml** — optional display data (dimension scores). Not used for session injection when observations exist.

### Session Injection Priority
1. **taste.md** (if exists) — user-confirmed rules, highest trust
2. **observations.md patterns** — Thinking Patterns + Behavioral Patterns injected as learned context
3. **profile.yaml dimensions** — legacy fallback only when neither taste.md nor observations exist

### How to Apply Observations

Observations capture DIRECTION and REASONING STYLE, not skill level. Two rules:

1. **Match their direction** — if they prefer cautious approaches, favor gradual migrations. If they prefer minimal code, avoid over-abstraction.

2. **Exceed their skill level** — always execute at professional best-practice quality. A "cautious" user gets expert-level caution (migration strategies, canary deploys), not amateur caution (try-catch everywhere).

## Critical Design Constraint: Infer A, Not C

Users think A → B → C then say C. When extracting preferences from behavior:
- **Extract the underlying principle (A)**, not the surface action (C)
- Example: user gives specific numeric counterexample → A is "systematic thinker who traces full paths", NOT "prefers concrete over abstract"
- Behavioral signals reveal direction but can mislead about motivation
- The extract-preferences prompt must always ask WHY, not just WHAT
