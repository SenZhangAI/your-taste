# Milestones

## v1.0 — Thinking Quality Optimizer (2026-03-05) [CURRENT]

Core architectural pivot from preference learner to reasoning quality optimizer. Complete.

### What shipped
- Two-stage pipeline: Stage 1 extracts reasoning gaps, Stage 2 synthesizes thinking framework
- Five gap categories: verification_skip, breadth_miss, depth_skip, assumption_leak, overreach
- Three-section framework output: Reasoning Checkpoints, Domain Reasoning, Failure Patterns
- Three-layer injection: CLAUDE.md rules, SessionStart context, UserPromptSubmit checkpoints
- `taste init` — batch scan of session history, working end-to-end
- `taste review` — rule proposal workflow
- `taste show` — display current framework
- Multi-provider LLM support (Anthropic, OpenAI, DeepSeek, Gemini, Groq, Mistral, OpenRouter, Ollama, claude-max-proxy)
- Privacy filter strips PII before analysis
- 141 tests passing
- README and ROADMAP rewritten for new positioning

### What's validated
- `taste init` scanned 294 sessions, analyzed 26, produced 18 structured observations (8 checkpoints, 5 domain, 5 failure patterns)
- Deduplication against existing CLAUDE.md works — most observations correctly mapped to existing rules
- Two genuinely new rules surfaced from the analysis

### Known issues at this milestone
- hookEventName field was missing from UserPromptSubmit hook output (fixed)
- Dependency on claude-cli-proxy for LLM calls — not documented, error message unclear
- `taste init` can fail mid-scan (fetch failed at 245/294) with no graceful degradation
- SessionEnd incremental loop not yet dogfooded over multiple sessions

---

## Pre-v1.0 — Preference Learner (deprecated)

Original architecture that learned user preferences across 6 dimensions and generated a personality profile. Replaced entirely by the reasoning quality approach.

Key artifacts removed: dimensions.js, analyze-session.md, profile.yaml, taste.md, personality narratives.
