# Roadmap

## Current: v1.0 — Thinking Quality Optimizer

your-taste detects reasoning gaps in AI sessions and synthesizes a thinking framework that prevents the same mistakes. The framework has three sections:

1. **Reasoning Checkpoints** — Verification steps before acting
2. **Domain Reasoning** — Context-specific thinking rules
3. **Failure Patterns** — Recurring reasoning errors with root causes

Five gap categories: `verification_skip`, `breadth_miss`, `depth_skip`, `assumption_leak`, `overreach`.

### Infrastructure
- Multi-provider LLM (Anthropic, OpenAI, DeepSeek, Gemini, Groq, Mistral, OpenRouter, Ollama, claude-max-proxy)
- Three-layer injection (CLAUDE.md rules, SessionStart domain context, UserPromptSubmit checkpoints)
- Privacy filter strips PII before analysis
- `taste init` for instant framework from history, `taste review` for rule proposals

---

## Next: Sharpen

- **Better A-to-C inference** — Improve extraction of missing reasoning steps vs surface preferences
- **Evidence decay** — Reduce weight of old evidence, strengthen recent patterns
- **Framework quality metrics** — Measure whether injected checkpoints actually prevent repeat mistakes

## Later: Expand

- **Cross-platform support** — Cursor, Codex, Copilot adapters
- **Team reasoning profiles** — Composite frameworks from team correction patterns
- **npm publish** — Official package release

---

## Contributing

See [README.md](README.md) for setup. Open issues describing the user problem, not just the solution.
