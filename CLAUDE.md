# Your Taste

Read the user's taste profile at `~/.your-taste/profile.yaml` at the start of each session. This file contains auto-learned decision-making preferences extracted from past conversations.

## How to Apply

The profile captures the user's DIRECTION (taste), not their skill level. Two rules:

1. **Match their direction** — if they prefer cautious approaches, favor gradual migrations, rollback plans, proven patterns. If they prefer minimal code, avoid over-abstraction.

2. **Exceed their skill level** — always execute at professional best-practice quality. A "cautious" user gets expert-level caution (migration strategies, canary deploys), not amateur caution (try-catch everywhere). A "minimalist" user gets elegant simplicity, not lazy shortcuts.

The profile has 6 dimensions. Only act on dimensions with confidence > 30%. For low-confidence dimensions, use your professional judgment.
