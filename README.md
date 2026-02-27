# your-taste

**AI learns your decision-making style, not your skill level.**

A Claude Code plugin that observes how you work with AI, discovers what you truly care about, and applies it automatically — so every session feels like working with someone who *gets you*.

## Principles

> **Taste ≠ Skill** — Your AI learns your direction, not your ability.

> **Your AI should know you by now.**

> **Understood, not just analyzed.**

> **Style, not only standards.** — Taste shapes how the AI works with you, on top of the quality bar.

## What You Get

**No more cold starts.** `taste init` scans your conversation history and builds your preference profile in seconds. Day-100 experience from day one.

**Consistent AI behavior.** Writing "I prefer minimal code" in CLAUDE.md means different things to the AI every session. your-taste translates your preferences into concrete behavioral instructions — deterministic, testable, applied the same way every time.

**Zero effort.** No config files to maintain. No questionnaires. The plugin watches how you respond to AI proposals — your corrections, your choices, your pushbacks — and learns silently. You just work.

**Your data stays yours.** Everything lives locally on your machine. No project code, no business logic, no conversation content is ever stored — just preference scores and distilled taste statements. Wide in, narrow out.

**You'll feel understood.** Most tools show you a score. your-taste distills your thinking into design philosophy — short statements like *"Clean breaks over compatibility debt"* or *"Code should explain itself"* that capture how you think, not just what you do.

## How It Works

```
Session ends → Read transcript → Filter sensitive data → Extract preference signals → Update profile
                                                                                          ↓
Session starts → Load profile → Render behavioral instructions → AI applies your taste ← ←
```

1. **SessionEnd hook** reads the conversation transcript
2. **Privacy filter** strips all credentials and PII locally — no sensitive data leaves your machine
3. **Claude Haiku** identifies decision moments (AI proposed X → you chose Y), extracts dimension scores and candidate behavioral rules
4. **Profile** updates with Bayesian scoring — confidence grows with consistent evidence
5. **Rules accumulate** — when a behavioral pattern appears consistently, you review and approve it. Approved rules are written to `taste.md` — concrete instructions the AI follows every session

## The 6 Dimensions

| Dimension | Low (0.0) | High (1.0) |
|---|---|---|
| **Risk Tolerance** | Cautious — gradual changes, proven patterns | Bold — clean breaks, move fast |
| **Complexity** | Minimalist — less code, simpler solutions | Comprehensive — thorough coverage |
| **Autonomy** | Collaborative — check before acting | Autonomous — decide and execute |
| **Communication** | Direct — brief, action-oriented | Detailed — thorough explanations |
| **Quality vs Speed** | Pragmatic — ship fast, iterate | Perfectionist — quality first |
| **Exploration** | Focused — stick to the task | Exploratory — improve surroundings |

Scores capture your *direction*, not your *skill*. If you lean minimalist, the AI delivers expert-level simplification — not naive implementations.

## Quick Start

### Prerequisites

- [Claude Code](https://code.claude.com/) installed
- `ANTHROPIC_API_KEY` environment variable set

### Install

```bash
claude plugin install your-taste
```

### Build Your Profile Instantly

```bash
taste init
```

Scans your past Claude Code sessions and builds your preference profile in seconds. No waiting, no questionnaires — just your real behavioral patterns.

### See Your Profile

```bash
taste show
```

### Local Development

```bash
git clone https://github.com/SenZhangAI/your-taste.git
cd your-taste && npm install
```

## Privacy

**your-taste never stores your code, business logic, or conversation content.**

What IS stored (`~/.your-taste/`):
- `profile.yaml` — 6 dimension scores (e.g., `risk_tolerance: 0.78`), confidence levels, evidence counts
- `taste.md` — Your behavioral rules and design philosophy in plain language (e.g., *"Clean breaks over compatibility debt"*)

What is NOT stored:
- Code snippets or file contents
- Business domain details
- Credentials, API keys, PII
- The conversation itself

All sensitive data is stripped **before** the transcript reaches the AI analyzer. The pipeline is wide-in, narrow-out: full conversation goes in, only abstract scores and behavioral rules come out.

## Configuration

Everything lives in `~/.your-taste/`:
- `profile.yaml` — dimension scores and confidence (human-readable, editable)
- `taste.md` — your behavioral rules and design philosophy (human-readable, editable)

Set `YOUR_TASTE_DIR` to change the storage location.

## Roadmap

See [ROADMAP.md](ROADMAP.md) for what's next — from instruction rendering to taste cards to cross-platform support.

## License

MIT
