# your-taste

**Your AI has massive potential. It's barely being used.**

Every AI coding session starts the same way — the AI knows nothing about you. Your thinking patterns, your design philosophy, what you've been working on, the decisions you've already made. So you spend half the session re-explaining context, correcting assumptions, and nudging the AI toward what you actually want.

The bottleneck isn't AI capability. It's that **AI doesn't know you**.

your-taste fixes this. It's a Claude Code plugin that learns how you think, what you care about, and what you're working on — then applies it automatically, every session.

<!-- TODO: GIF comparison — with vs without your-taste on the same task -->

## Who This Is For

**Heavy AI users who want their AI to be proactive, not reactive.**

If you've ever thought:
- "I just explained this three sessions ago"
- "Stop listing 5 options — just pick the best one"
- "You know my codebase, why are you still asking basic questions?"
- "I shouldn't have to tell you my preferences every time"

Then you're fighting the same problem your-taste was built to solve.

This is not for casual AI users. It's for people who treat AI as a daily collaborator and expect it to get better at working with *them* over time.

## Design Philosophy

### 1. The gap isn't intelligence — it's context

AI models are extraordinarily capable. But capability without context produces generic output. The same model that writes brilliant code for one developer produces mediocre suggestions for another — not because it's less capable, but because it doesn't know what "good" means *to that person*.

### 2. Understanding you is the unlock

When AI knows your decision-making patterns, your design philosophy, and your current strategic context, something changes. It stops being a tool you direct and starts being a collaborator that anticipates. It infers your *intent*, not just your *instruction*.

You say C, but you thought A → B → C. A great collaborator traces back to A and works forward from there — considering implications you haven't stated yet.

### 3. Taste ≠ Skill

your-taste learns your *direction*, not your *ability*. If you lean minimalist, the AI delivers expert-level simplification — not naive implementations. Your taste sets the direction; professional quality is non-negotiable.

### 4. Behavior > Declaration (with limits)

We learn from what you *do*, not what you *say*. Your corrections, your choices, your pushbacks in real sessions — these are the real signal. But behavior has limits: observing *what* you do doesn't always reveal *why* you do it. That's why the system also infers the underlying principles behind your actions.

## What You Get

**No more cold starts.** `taste init` scans your conversation history and builds your preference profile in seconds. Day-100 experience from day one.

**Consistent AI behavior.** Writing "I prefer minimal code" in CLAUDE.md means different things to the AI every session. your-taste translates your preferences into concrete behavioral instructions — deterministic, testable, applied the same way every time.

**Zero effort.** No config files to maintain. No questionnaires. The plugin watches how you respond to AI proposals and learns silently. You just work.

**Your data stays yours.** Everything lives locally on your machine. No project code, no business logic, no conversation content is ever stored — just preference scores and distilled taste statements. Wide in, narrow out.

## How It Works

```
Session ends → Read transcript → Filter PII → Extract signals → Update profile + context
                                                                          ↓
Every message → Inject thinking framework + project goal + recent context
                                                                          ↓
Session starts → Load taste.md + goal.md + context.md → AI starts informed
```

**Learning (SessionEnd)**
1. Privacy filter strips all credentials and PII locally
2. Claude Haiku extracts dimension scores, candidate behavioral rules, and strategic context (decisions, open questions, topics)
3. Profile updates with Bayesian scoring; rules accumulate in `pending.yaml`
4. Project `context.md` and `global-context.md` update automatically

**Applying (SessionStart + every message)**
5. SessionStart injects your `taste.md` rules + project `goal.md` + recent context
6. UserPromptSubmit hook injects a thinking framework on every message — guiding AI to infer your *intent* (A), not just your *instruction* (C)
7. Priority-based injection ensures the most important context always fits within budget

## The 6 Dimensions

| Dimension | Low (0.0) | High (1.0) |
|---|---|---|
| **Risk Tolerance** | Cautious — gradual changes, proven patterns | Bold — clean breaks, move fast |
| **Complexity** | Minimalist — less code, simpler solutions | Comprehensive — thorough coverage |
| **Autonomy** | Collaborative — check before acting | Autonomous — decide and execute |
| **Communication** | Direct — brief, action-oriented | Detailed — thorough explanations |
| **Quality vs Speed** | Pragmatic — ship fast, iterate | Perfectionist — quality first |
| **Exploration** | Focused — stick to the task | Exploratory — improve surroundings |

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
- `profile.yaml` — 6 dimension scores, confidence levels, evidence counts
- `taste.md` — Your behavioral rules and design philosophy in plain language
- `global-context.md` — Cross-project focus topics (what you're working on across projects)
- `projects/<name>/goal.md` — Project vision and constraints (user-authored)
- `projects/<name>/context.md` — Recent tactical decisions and open questions (auto-maintained)

What is NOT stored:
- Code snippets or file contents
- Business domain details
- Credentials, API keys, PII
- The conversation itself

All sensitive data is stripped **before** the transcript reaches the AI analyzer. The pipeline is wide-in, narrow-out: full conversation goes in, only abstract scores, behavioral rules, and strategic-level context come out.

## Configuration

Everything lives in `~/.your-taste/`:
- `profile.yaml` — dimension scores and confidence (machine-internal, human-readable)
- `taste.md` — your behavioral rules and design philosophy (human-readable, editable)
- `pending.yaml` — candidate rules awaiting review (machine-internal)
- `global-context.md` — cross-project focus tracking (human-readable, editable)
- `projects/<name>/goal.md` — project vision and constraints (human-authored)
- `projects/<name>/context.md` — recent decisions, open questions, last session (auto-maintained)

Set `YOUR_TASTE_DIR` to change the storage location.

## Roadmap

See [ROADMAP.md](ROADMAP.md) for what's next — from context acceleration to cross-platform support.

## License

MIT
