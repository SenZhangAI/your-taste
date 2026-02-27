# Roadmap

## Design Principles

These four principles guide every version of your-taste:

1. **Taste ≠ Skill** — Your AI learns your *direction* (cautious vs bold, minimal vs comprehensive), not your ability. If you lean minimalist, the AI delivers expert-level simplification — not naive implementations.

2. **Your AI Should Know You By Now** — You've worked with AI for hundreds of hours. It still doesn't know you prefer clean rewrites, or that you hate verbose explanations. your-taste closes this gap — observing behavior to understand the deeper values behind it, so every session feels like working with someone who gets you.

3. **Understood, Not Just Analyzed** — You should feel *understood and appreciated*, not reduced to scores. Every touchpoint renders personality narratives that affirm your decision-making style — telling you why your approach works, not just what it is.

4. **Style, Not Only Standards** — Your taste shapes how the AI works with you, on top of the quality bar. Non-negotiable baselines stay: error handling at system boundaries, security best practices, data integrity. Taste adds your personal style on top of solid engineering.

---

## Current State (v0.1.0)

- SessionEnd hook → privacy filter → Haiku analysis → Bayesian profile update
- 6 meta-dimensions, YAML profile at `~/.your-taste/profile.yaml`
- SessionStart hook reports active dimensions
- Claude Code plugin, single machine

---

## v0.2 — Make It Work

**Goal:** Users feel the AI actually behaves differently after installing your-taste.

### Instruction Renderer (P0)

The core product. Translates dimension scores into concrete behavioral directives:

```
risk_tolerance: 0.2 → "Prefer gradual migration over rewrites. Include rollback plans for production changes."
risk_tolerance: 0.8 → "Prefer clean rewrites. Skip backward compatibility unless there's a running production dependency."
```

- Template-based: each dimension has 3-5 instruction variants mapped to score ranges
- Mid-range scores (0.35-0.65) produce no instructions — respect ambiguous preferences
- Deterministic, testable, consistent across sessions

### Backfill Init — `taste init` (P0)

Scan `~/.claude/projects/` for historical session transcripts to build an instant profile:

```
$ taste init
Scanning 47 past sessions...

Found: You favor clean breaks over patching (risk_tolerance: 0.74)
Found: You prefer brief, action-oriented responses (communication: 0.28)

Profile ready! Run `taste show` for details.
```

Solves cold start — collapses time-to-value from days to minutes.

### additionalContext Injection (P0)

SessionStart hook outputs rendered instructions via `hookSpecificOutput.additionalContext`. AI receives concrete behavioral directives at session start, invisible to user. CLAUDE.md retained as fallback.

### Quality Floor + Confidence Gating (P1)

- Instructions include non-negotiable professional baselines
- Dimensions with confidence < 0.3 produce no instructions — default to professional judgment
- Higher confidence → fewer, more precise instructions (counterintuitive: more data → fewer directives)

### `taste show` (P1)

Terminal visualization with personality narratives:

```
risk_tolerance    ████████░░  0.78  bold       (14 obs)
  You favor clean breaks over patching — this takes judgment and confidence.

complexity        ███░░░░░░░  0.32  minimalist (8 obs)
  You cut through complexity to find the simple solution.
```

### Personality Narrative Engine (P1)

Human-facing rendering layer parallel to the instruction renderer. Each dimension maps score ranges to affirming descriptions of why the user's style is valuable. Implemented as `personalityNarrative` templates in `dimensions.js`.

---

## v0.3 — Make It Transparent

**Goal:** Graduate from template instructions to real accumulated rules. Users trust the system — they can see learning progress and correct mistakes.

### Rule Accumulation — `taste.md` (P0)

The upgrade from template-rendered instructions to real behavioral rules:

1. **Extract**: Haiku prompt extended to produce candidate behavioral rules and design philosophy alongside dimension scores
2. **Accumulate**: Candidates silently stored in `pending.yaml`, deduplicated, occurrence-counted
3. **Review**: When a rule reaches 3 occurrences, notify user. `taste review` shows pending rules — Accept, Edit, or Dismiss
4. **Persist**: Approved rules written to `~/.your-taste/taste.md` — becomes the primary AI instruction source, replacing template rendering

```
$ taste review

1. "Clean breaks over gradual migration"
   Seen 3 times (Feb 20 - Feb 27)
   [Accept] [Edit] [Dismiss]

2. "Naming > comments. If you need a comment, the name is wrong."
   Seen 4 times (Feb 15 - Feb 26)
   [Accept] [Edit] [Dismiss]
```

taste.md is human-readable and editable — you own your preference file. Manual edits and auto-approved rules coexist.

### Other v0.3 Features

- **evidence.jsonl** — Append-only evidence log. Enables algorithm experimentation and future sync.
- **`taste adjust` / `taste note`** — Lightweight correction mechanism. Manual signals weighted lower than behavioral evidence, but gives you agency.
- **Milestone notifications** — Growth narratives in status line: "Your quality trade-off instincts have become sharper" — not cold data diffs.
- **Time decay** — 90-day half-life. Recent evidence weighs more.

---

## v0.4 — Make It Spread

**Goal:** Organic growth through shareable artifacts.

- **Taste cards** — Radar chart + personality narratives. Shareable to Twitter/Slack/LinkedIn. Only after profiles are proven accurate.
- **Community launch** — Reddit (r/ClaudeAI, r/coding), Hacker News Show HN, awesome-claude-code.
- **Blog post** — "Stop re-teaching your AI your preferences every session." Lead with pain point, unfold philosophy.
- **npm publish** — Official package release.

---

## v1.0 — Make It Cross-Platform

**Goal:** From Claude Code tool to universal developer preference standard.

- **Agent Skills packaging** — One format consumed by multiple platforms
- **Cross-platform adapters** — Cursor, Codex, Copilot, and others
- **Team profiles** — Composite team preference profiles
- **Dynamic dimension discovery** — Beyond fixed 6 dimensions, discover new preference axes
- **Context-aware overrides** — Different project types auto-adjust taste application

---

## Contributing

Each version has clear boundaries. If you want to contribute:

- **v0.2 work** — Instruction renderer templates, backfill implementation, additionalContext integration
- **v0.3 work** — Rule extraction pipeline, taste.md generation, review UX, evidence storage
- **Ideas** — Open an issue describing the user problem, not just the solution

See [README.md](README.md) for setup instructions.
