# your-taste

**Your corrections permanently upgrade how AI reasons about your problems.**

Every time you correct an AI — "don't assume, verify first", "you missed the adjacent impact", "trace back to the root cause" — that correction fixes one response. Then it's forgotten. Next session, same mistakes.

your-taste captures these reasoning corrections and synthesizes them into a thinking framework that's injected into every AI message. The AI stops making the same reasoning errors across sessions.

## How It Works

```
Session ends → Extract reasoning gaps → Synthesize thinking framework
                                              ↓
Every message → Inject framework as reasoning checkpoints
```

**Reasoning gaps** are moments where AI's thinking broke down:

| Category | What broke | Example |
|----------|-----------|---------|
| `verification_skip` | Acted without verifying | Assumed a file was missing after one failed search |
| `breadth_miss` | Missed adjacent implications | Fixed a bug without checking related assumptions |
| `depth_skip` | Stopped at surface level | Responded to the literal request instead of the underlying need |
| `assumption_leak` | Treated hypothesis as fact | Implemented based on unverified user claim about code behavior |
| `overreach` | Expanded scope unnecessarily | Full-chain analysis when user pointed to a specific target |

These gaps are synthesized into a **thinking framework** with three sections:

1. **Reasoning Checkpoints** — Verification steps before acting (e.g., "When a user describes code behavior, trace the actual call chain before implementing")
2. **Domain Reasoning** — How to think correctly in specific problem domains
3. **Failure Patterns** — Recurring reasoning errors with root causes

The framework evolves: new sessions add evidence, weak patterns fade, strong ones strengthen.

## Install

Requires [Claude Code](https://code.claude.com/).

```bash
claude plugin install your-taste
```

## Quick Start

### 1. Build your thinking framework from past sessions

```bash
taste insights
```

Scans your Claude Code history, extracts reasoning gaps, and synthesizes your thinking framework.

### 2. See what was learned

```bash
taste show
```

### 3. Review proposed rules

```bash
taste review
```

Strong patterns get proposed as behavioral rules. Review and accept/reject them — accepted rules are written to `~/.claude/CLAUDE.md` where Claude Code reads them natively.

After the initial scan, the framework evolves automatically via the SessionEnd hook. No maintenance needed.

## Commands

| Command | What it does |
|---------|-------------|
| `taste insights` | Scan sessions and extract reasoning insights |
| `taste show` | Display current thinking framework |
| `taste review` | Accept/reject proposed rules |
| `taste status` | Show configuration and framework stats |
| `taste debug on/off/log` | Toggle debug mode |

## Privacy

**No code, business logic, or conversation content is stored.**

Stored locally in `~/.your-taste/`:
- `observations.md` — Your thinking framework (reasoning checkpoints, domain rules, failure patterns)
- `proposals.jsonl` — Pending rule proposals
- `config.yaml` — LLM provider config

Confirmed rules live in `~/.claude/CLAUDE.md` (managed `<!-- your-taste:start/end -->` section).

All sensitive data is stripped before analysis. Full conversation goes in, only reasoning patterns come out.

## Configuration

Set `YOUR_TASTE_DIR` to change storage location (default: `~/.your-taste/`).

### LLM Providers

your-taste needs an LLM for analysis. Set an env var and it auto-detects:

| Priority | Provider | Env Variable | Default Model |
|----------|----------|-------------|---------------|
| 1 | Anthropic | `ANTHROPIC_API_KEY` | claude-haiku-4-5 |
| 2 | OpenAI | `OPENAI_API_KEY` | gpt-4o-mini |
| 3 | DeepSeek | `DEEPSEEK_API_KEY` | deepseek-chat |
| 4 | Gemini | `GEMINI_API_KEY` | gemini-2.0-flash |
| 5 | Groq | `GROQ_API_KEY` | llama-3.3-70b-versatile |
| 6 | Mistral | `MISTRAL_API_KEY` | mistral-small-latest |
| 7 | OpenRouter | `OPENROUTER_API_KEY` | anthropic/claude-haiku |

Or configure explicitly in `~/.your-taste/config.yaml`:

```yaml
provider: deepseek
apiKey: sk-...
# model: deepseek-chat    # optional override
```

### Ollama (local models)

```yaml
provider: ollama
model: llama3.2
```

### Claude Max Proxy (no API key needed)

With a Claude subscription, use [claude-max-api-proxy](https://github.com/atalovesyou/claude-max-api-proxy) as a local API:

```yaml
provider: claude-max-proxy
```

### No provider?

Outside Claude Code, falls back to `claude -p` (Claude Code CLI).

## Architecture

Three-layer injection:

1. **CLAUDE.md** (native) — Confirmed behavioral rules, read by Claude Code directly
2. **SessionStart hook** — Domain reasoning + failure patterns from the thinking framework
3. **UserPromptSubmit hook** — Reasoning checkpoints injected per message

Two learning channels:

1. **`taste insights`** (batch) — Stage 1 extracts reasoning gaps → Stage 2 synthesizes framework
2. **SessionEnd hook** (incremental) — Analyzes each session, proposes new rules

## License

MIT
