# your-taste

**AI learns your decision-making style, not your skill level.**

A Claude Code plugin that observes how you interact with AI across sessions, extracts your preference patterns, and applies them automatically — so the AI gets better at working with you over time, without being told.

## Why This Matters

Every AI coding session starts from zero. The AI doesn't know if you prefer cautious migrations or clean breaks, minimal code or comprehensive abstractions, brief answers or detailed explanations.

You can write instructions in CLAUDE.md, but:
- Most people can't fully articulate their own preferences
- **Your corrections reveal more than your declarations** — choosing to simplify an AI's verbose proposal says more than writing "I prefer concise code"

your-taste watches these moments and builds a structured preference profile automatically.

### Taste ≠ Skill

This is not about making AI mimic you. It's about making AI understand your *direction* while executing at *professional quality*.

| What we learn | What we DON'T learn |
|---|---|
| You prefer cautious approaches | Your specific coding habits |
| You like minimal abstractions | Your knowledge gaps |
| You want direct communication | Your skill limitations |
| You value quality over speed | Your bad patterns |

If you prefer caution, the AI gives you **expert-level caution** — migration strategies with rollback plans, not try-catch everywhere. Your taste sets the direction; professional expertise sets the quality bar.

## How It Works

```
Session ends → Read transcript → Filter sensitive data → AI extracts preference signals → Update profile
                                                                                              ↓
Session starts → Load profile → AI applies your taste at professional quality ← ← ← ← ← ← ←
```

1. **SessionEnd hook** reads the conversation transcript
2. **Privacy filter** strips all business data, credentials, and PII — only behavioral patterns are analyzed
3. **Claude Haiku** identifies decision moments (AI proposed X → you chose Y) and maps them to 6 personality dimensions
4. **Profile** updates with Bayesian scoring — confidence grows with consistent evidence

## The 6 Dimensions

| Dimension | Low (0.0) | High (1.0) |
|---|---|---|
| **Risk Tolerance** | Cautious — gradual changes, proven patterns | Bold — clean breaks, move fast |
| **Complexity** | Minimalist — less code, simpler solutions | Comprehensive — thorough coverage |
| **Autonomy** | Collaborative — check before acting | Autonomous — decide and execute |
| **Communication** | Direct — brief, action-oriented | Detailed — thorough explanations |
| **Quality vs Speed** | Pragmatic — ship fast, iterate | Perfectionist — quality first |
| **Exploration** | Focused — stick to the task | Exploratory — improve surroundings |

## Installation

### Prerequisites

- [Claude Code](https://code.claude.com/) installed
- `ANTHROPIC_API_KEY` environment variable set (used for Haiku analysis calls)

### Install

```bash
claude plugin install your-taste
```

Or for local development:

```bash
git clone https://github.com/SenZhangAI/your-taste.git
cd your-taste && npm install
claude --plugin-dir ./your-taste
```

## Privacy

**your-taste never stores your code, business logic, or conversation content.**

What IS stored (`~/.your-taste/profile.yaml`):
- Dimension scores (e.g., `risk_tolerance: 0.3`)
- Abstract pattern descriptions (e.g., "Prefers gradual migration patterns")
- Confidence levels and evidence counts

What is NOT stored:
- Code snippets or file contents
- Business domain details
- Credentials, API keys, card numbers, PII
- The conversation transcript itself

All sensitive data is stripped **before** the transcript reaches the AI analyzer. The full privacy filter runs locally — no sensitive data leaves your machine.

## Configuration

The profile lives at `~/.your-taste/profile.yaml`. You can edit it manually — the AI will respect your edits. Set `YOUR_TASTE_DIR` environment variable to change the storage location.

## Philosophy

> Most people can't fully describe their own preferences. But their behavior is honest.

This tool exists because the best way to learn someone's taste is to watch what they do, not ask what they want. Every time you modify an AI suggestion, accept a proposal, or push back on an approach, you're revealing your real preferences — often ones you couldn't articulate yourself.

The goal isn't to make AI agree with you. It's to make AI understand you well enough to be a better collaborator — one that matches your values while exceeding your expectations.

## License

MIT
