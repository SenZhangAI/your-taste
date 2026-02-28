# Your Taste

## Core Purpose

Your-taste is a **context accelerator**, not just a preference tracker. The goal is not "understand the user" as an end — it's to **reduce the information gap between user and AI**, enabling faster autonomous collaboration.

Understanding taste is one means. The full picture includes:
- **Direction preferences** (cautious vs bold, minimal vs comprehensive)
- **Decision principles** (concrete rules extracted from repeated behavior)
- **Strategic context** (what the user is focused on, what was already decided)
- **Thinking patterns** (how users reason, so AI can predict intent)

## How to Apply Profiles

The profile captures DIRECTION (taste), not skill level. Two rules:

1. **Match their direction** — if they prefer cautious approaches, favor gradual migrations. If they prefer minimal code, avoid over-abstraction.

2. **Exceed their skill level** — always execute at professional best-practice quality. A "cautious" user gets expert-level caution (migration strategies, canary deploys), not amateur caution (try-catch everywhere).

Only act on dimensions with confidence > 30%. For low-confidence dimensions, use professional judgment.

## Critical Design Constraint: Infer A, Not C

Users think A → B → C then say C. When extracting preferences from behavior:
- **Extract the underlying principle (A)**, not the surface action (C)
- Example: user gives specific numeric counterexample → A is "systematic thinker who traces full paths", NOT "prefers concrete over abstract"
- Behavioral signals reveal direction but can mislead about motivation
- The extract-preferences prompt must always ask WHY, not just WHAT
