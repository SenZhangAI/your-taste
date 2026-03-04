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

**No more cold starts.** `taste init` scans your conversation history and builds your observations in seconds. Day-100 experience from day one.

**Consistent AI behavior.** Writing "I prefer minimal code" in CLAUDE.md means different things to the AI every session. your-taste distills your preferences into observations with context conditions and concrete behavioral rules — applied the same way every time.

**Zero effort.** No config files to maintain. No questionnaires. The plugin watches how you respond to AI proposals and learns silently. You just work.

**Your data stays yours.** Everything lives locally on your machine. No project code, no business logic, no conversation content is ever stored — just distilled observations and behavioral rules. Wide in, narrow out.

## How It Works

```
Session ends → Read transcript → Filter PII → Extract decision points → Synthesize observations
                                                                          ↓
Every message → Inject thinking framework + project goal + recent context
                                                                          ↓
Session starts → Load observations + goal.md + context.md → AI starts informed
```

**Learning (two channels)**

1. **`taste init` (batch)**: Scans past session transcripts → Stage 1 extracts decision points → Stage 2 synthesizes `observations.md` (narrative document with Thinking Patterns, Working Principles, Suggested Rules, Common Misreads) → Suggested rules go to `proposals.jsonl`

2. **SessionEnd hook (incremental)**: Analyzes each session for strong behavioral signals → new rule proposals go to `proposals.jsonl` → project `context.md` and `global-context.md` update automatically

**Confirming rules**: `taste review` presents proposals for user approval → accepted rules write to `~/.claude/CLAUDE.md` in a managed section (`<!-- your-taste:start/end -->`) → Claude Code reads them natively

**Applying (three-layer injection)**

1. **CLAUDE.md** (native) — Confirmed behavioral rules, consumed by Claude Code without hooks
2. **SessionStart** — Working Principles + Common Misreads from observations + project context
3. **UserPromptSubmit** — Thinking framework + personalized thinking patterns + goal + context on every message

## Quick Start

### Prerequisites

- [Claude Code](https://code.claude.com/) installed
- An LLM provider configured (see [Providers](#providers) below)

### Install

```bash
claude plugin install your-taste
```

### Build Your Observations Instantly

```bash
taste init
```

Scans your past Claude Code sessions and builds observations in seconds. No waiting, no questionnaires — just your real behavioral patterns.

### Review Rule Proposals

```bash
taste review
```

### Check Status

```bash
taste status
```

### Local Development

```bash
git clone https://github.com/SenZhangAI/your-taste.git
cd your-taste && npm install
```

## Privacy

**your-taste never stores your code, business logic, or conversation content.**

What IS stored (`~/.your-taste/`):
- `observations.md` — Thinking patterns, behavioral patterns with context conditions, suggested rules
- `global-context.md` — Cross-project focus topics (what you're working on across projects)
- `projects/<name>/goal.md` — Project vision and constraints (user-authored)
- `projects/<name>/context.md` — Recent tactical decisions and open questions (auto-maintained)
- `proposals.jsonl` — Pending rule suggestions awaiting review
- `config.yaml` — LLM provider configuration

Confirmed rules live in `~/.claude/CLAUDE.md` (managed section).

What is NOT stored:
- Code snippets or file contents
- Business domain details
- Credentials, API keys, PII
- The conversation itself

All sensitive data is stripped **before** the transcript reaches the AI analyzer. The pipeline is wide-in, narrow-out: full conversation goes in, only narrative observations, behavioral rules, and strategic-level context come out.

## Configuration

Set `YOUR_TASTE_DIR` to change the storage location (default: `~/.your-taste/`).

## Providers

your-taste needs an LLM to analyze your sessions. Set an environment variable and it auto-detects, or configure explicitly in `~/.your-taste/config.yaml`.

### Auto-detection (zero config)

Set any of these env vars — first one found wins:

| Priority | Provider | Env Variable | Default Model |
|----------|----------|-------------|---------------|
| 1 | Anthropic | `ANTHROPIC_API_KEY` | claude-haiku-4-5 |
| 2 | OpenAI | `OPENAI_API_KEY` | gpt-4o-mini |
| 3 | DeepSeek | `DEEPSEEK_API_KEY` | deepseek-chat |
| 4 | Gemini | `GEMINI_API_KEY` | gemini-2.0-flash |
| 5 | Groq | `GROQ_API_KEY` | llama-3.3-70b-versatile |
| 6 | Mistral | `MISTRAL_API_KEY` | mistral-small-latest |
| 7 | OpenRouter | `OPENROUTER_API_KEY` | anthropic/claude-haiku |

### Explicit config

Create `~/.your-taste/config.yaml`:

```yaml
provider: deepseek
apiKey: sk-...
# model: deepseek-chat    # optional, overrides default
# baseUrl: https://...    # optional, overrides default
```

### Claude Max Proxy (use your subscription, no API key)

If you have a Claude Max/Pro subscription but no API key, [claude-max-api-proxy](https://github.com/atalovesyou/claude-max-api-proxy) wraps your Claude Code CLI as a local OpenAI-compatible API:

```bash
git clone https://github.com/atalovesyou/claude-max-api-proxy.git
cd claude-max-api-proxy && npm install && npm run build
node dist/server/standalone.js  # runs on localhost:3456
```

Then configure:

```yaml
provider: claude-max-proxy
# model: claude-sonnet-4   # or claude-opus-4, claude-haiku-4
```

### Ollama (local models)

```yaml
provider: ollama
model: llama3.2
# baseUrl: http://localhost:11434/v1   # default
```

### No provider?

Outside Claude Code, your-taste falls back to `claude -p` (Claude Code CLI). Inside Claude Code, you need one of the above configured.

## Roadmap

See [ROADMAP.md](ROADMAP.md) for what's next — from context acceleration to cross-platform support.

## License

MIT
