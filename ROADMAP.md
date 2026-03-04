# Roadmap

## Design Principles

1. **The gap isn't intelligence — it's context.** AI models are extraordinarily capable, but capability without context produces generic output. The bottleneck is that AI doesn't know you — your thinking patterns, your current focus, your past decisions.

2. **Infer A, not C.** Users think A → B → C then say C. A great collaborator traces back to A — the underlying principle — and works forward from there. Surface behavior can mislead about motivation; always extract the WHY, not just the WHAT.

3. **Taste ≠ Skill.** We learn your *direction* (cautious vs bold, minimal vs comprehensive), not your *ability*. Your taste sets direction; professional quality is non-negotiable.

4. **Behavior > Declaration (with limits).** We learn from what you *do*, not what you *say*. But behavior has a fidelity boundary: observing *what* doesn't always reveal *why*. That's why the system also infers the underlying principles behind your actions.

---

## Current State (v0.4.0)

your-taste is a **context accelerator** — it reduces the information gap between you and AI through three layers:

### Observation-Based Learning
- **Two-pass analysis pipeline**: Stage 1 extracts decision points per session, Stage 2 synthesizes narrative `observations.md`
- **observations.md** four-section structure: Thinking Patterns (cognitive models), Working Principles (context-dependent preferences with motivation), Suggested Rules (review candidates), Common Misreads (AI error prevention)
- **proposals.jsonl** stages rule suggestions from both `taste init` and SessionEnd for user review
- **CLAUDE.md managed section** (`<!-- your-taste:start/end -->`) stores user-confirmed behavioral rules, consumed natively by Claude Code

### Project-Scoped Context
- **`goal.md`** — Project vision, constraints, architectural decisions, rejected approaches (stable, user-authored)
- **`context.md`** — Recent tactical decisions (FIFO 10), open questions, last session summary (auto-maintained)
- **`global-context.md`** — Cross-project focus tracking (max 5 topics, 30-day TTL decay)
- Project isolation via `~/.your-taste/projects/<name>/` directories

### Three-Layer Injection
- **CLAUDE.md** (native) — Confirmed behavioral rules, consumed by Claude Code without hooks
- **SessionStart** (once per session) — Working Principles + Common Misreads from observations, project context, proposals notification
- **UserPromptSubmit** (every message) — Thinking framework + personalized thinking patterns + goal + context + global focus (4KB budget, priority-based)

### Infrastructure
- Multi-provider LLM support (Anthropic, OpenAI, DeepSeek, Gemini, Groq, Mistral, OpenRouter, Ollama, claude-max-proxy)
- Privacy filter strips all PII before LLM analysis
- `taste init` backfill from conversation history — instant observations in seconds
- `taste review` for approving rule proposals into CLAUDE.md
- Debug mode (`taste debug on/off/log`) for troubleshooting
- 157 tests across 19 test files

---

## Next: Polish & Validate

Focus on proving the context accelerator value before expanding scope.

- **A→C inference few-shot examples** — Improve extraction of underlying principles, not surface behavior
- **Decision promotion** — Detect repeated tactical decisions → suggest promotion to `goal.md`
- **Taste-aware thinking instructions** — Personalize the thinking framework based on observations
- **Goal auto-suggestions** — When context patterns repeat across sessions, proactively suggest goal.md entries

## Later: Growth

- **Taste cards** — Shareable profile visualization + personality narratives
- **Community launch** — Show HN, r/ClaudeAI, awesome-claude-code
- **npm publish** — Official package release

## Future: Cross-Platform

- Multi-source adapters (Cursor, Codex, Copilot, OpenClaw)
- Evidence-based sync (append-only evidence log, CRDT-native merge)
- Team profiles — composite team preference profiles
- Dynamic dimension discovery

---

## Contributing

See [README.md](README.md) for setup instructions. Open issues describing the user problem, not just the solution.
