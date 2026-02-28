# Roadmap

## Design Principles

1. **The gap isn't intelligence — it's context.** AI models are extraordinarily capable, but capability without context produces generic output. The bottleneck is that AI doesn't know you — your thinking patterns, your current focus, your past decisions.

2. **Infer A, not C.** Users think A → B → C then say C. A great collaborator traces back to A — the underlying principle — and works forward from there. Surface behavior can mislead about motivation; always extract the WHY, not just the WHAT.

3. **Taste ≠ Skill.** We learn your *direction* (cautious vs bold, minimal vs comprehensive), not your *ability*. Your taste sets direction; professional quality is non-negotiable.

4. **Behavior > Declaration (with limits).** We learn from what you *do*, not what you *say*. But behavior has a fidelity boundary: observing *what* doesn't always reveal *why*. That's why the system also infers underlying principles behind your actions.

---

## Current State (v0.4.0)

your-taste is a **context accelerator** — it reduces the information gap between you and AI through four layers:

### Preference Learning
- 6-dimension Bayesian profiling (risk tolerance, complexity, autonomy, communication, quality vs speed, exploration)
- Behavioral rule accumulation: silent observation → `pending.yaml` → user review → `taste.md`
- Instruction rendering: dimension scores → concrete behavioral directives, confidence-gated

### Project-Scoped Context
- **`goal.md`** — Project vision, constraints, architectural decisions, rejected approaches (stable, user-authored)
- **`context.md`** — Recent tactical decisions (FIFO 10), open questions, last session summary (auto-maintained)
- **`global-context.md`** — Cross-project focus tracking (max 5 topics, 30-day TTL decay)
- Project isolation via `~/.your-taste/projects/<name>/` directories

### Intent Inference
- **UserPromptSubmit hook** injects thinking framework on every message
- Guides AI to trace from surface statement (C) back to underlying intent (A)
- Priority-based injection: thinking framework > goal > project context > global context (4000-char budget)

### Infrastructure
- Privacy filter strips all PII before LLM analysis
- `taste init` backfill from conversation history — instant profile in seconds
- `taste show` with personality narratives
- `taste review` for approving accumulated behavioral rules

---

## Next: Polish & Validate

Focus on proving the context accelerator value before expanding scope.

- **A→C inference few-shot examples** — Improve Haiku's ability to extract underlying principles, not surface behavior
- **Decision promotion** — Detect repeated tactical decisions → suggest promotion to `goal.md` (reuse taste review pattern)
- **Taste-aware thinking instructions** — Personalize the thinking framework based on user's dimension profile
- **Goal auto-suggestions** — When context patterns repeat across sessions, proactively suggest goal.md entries

## Later: Growth

- **Taste cards** — Shareable radar chart + personality narratives (requires proven-accurate profiles)
- **Community launch** — Show HN, r/ClaudeAI, awesome-claude-code
- **npm publish** — Official package release

## Future: Cross-Platform

- Multi-source adapters (Cursor, Codex, Copilot, OpenClaw)
- Evidence-based sync (append-only evidence log, CRDT-native merge)
- Team profiles — composite team preference profiles
- Dynamic dimension discovery — beyond fixed 6 dimensions

---

## Contributing

See [README.md](README.md) for setup instructions. Open issues describing the user problem, not just the solution.
