# Data Architecture Proposal

## 1. Data Sources -- Where to Read From

### 1.1 Transcript Formats by Tool

Every AI coding tool stores conversations differently. There is no universal format.

| Tool | Format | Location | Structure |
|------|--------|----------|-----------|
| **Claude Code** | JSONL | `~/.claude/projects/{hash}/{session}.jsonl` | `{type, message: {role, content}, sessionId, cwd, gitBranch, timestamp}` |
| **OpenClaw** | JSONL + SQLite | `~/.openclaw/agents/{agentId}/sessions/{sessionId}.jsonl` | Similar message-per-line, also ingested into `~/.openclaw/observability.db` |
| **Codex CLI** | JSONL | `~/.codex/sessions/YYYY/MM/DD/rollout-XXXX.jsonl` | Event-based: `thread.started`, `turn.started`, `turn.completed`, `item.*` |
| **Cursor** | SQLite | `{appdata}/Cursor/User/workspaceStorage/{hash}/state.vscdb` | JSON blob in SQLite keyed by `workbench.panel.aichat.view.aichat.chatdata` |
| **Windsurf** | JSONL / Tauri .dat | OS-specific app data directory | Sessions/messages/parts in JSON |
| **Gemini CLI** | JSON | `~/.gemini/tmp/{project_hash}/chats/checkpoint-{name}.json` | `{role: "user"|"model", parts: [{text}]}` |
| **GitHub Copilot** | JSON | VS Code `workspaceStorage/{hash}/chatSessions/*.json` | Per-workspace chat session JSON files |
| **Aider** | Markdown | `.aider.chat.history.md` (per project) | `####` headers for user input, prose for responses |

### 1.2 Architecture Decision: Adapter Pattern

No universal format exists. The correct approach is **one adapter per source**, normalizing into a common internal representation.

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Claude Code   │  │  OpenClaw     │  │  Codex CLI    │  ...
│   Adapter     │  │   Adapter     │  │   Adapter     │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       │                 │                 │
       ▼                 ▼                 ▼
  ┌─────────────────────────────────────────────┐
  │           Normalized Conversation            │
  │  { role, text, timestamp, source_tool }      │
  └──────────────────┬──────────────────────────┘
                     │
                     ▼
            ┌─────────────────┐
            │  Preference      │
            │  Analyzer        │
            └─────────────────┘
```

**Normalized message format:**

```js
{
  role: "human" | "assistant",
  text: string,
  timestamp: string,        // ISO 8601
  source: "claude-code" | "openclaw" | "codex" | "cursor" | ...,
  session_id: string,       // deduplicate across runs
}
```

The analyzer only sees normalized conversations. Source-specific parsing stays isolated in adapters.

**Prior art:** The [ai-data-extraction](https://github.com/0xSero/ai-data-extraction) project already normalizes Claude Code, Cursor, Codex, Windsurf, and Gemini into a common JSONL format with `{role, content, code_context, timestamp}`. We can study their adapter implementations rather than reverse-engineering each format from scratch.

### 1.3 Git History as a Data Source

Git history is uniquely valuable because it's **universal across all tools** and captures real decisions (not just conversations about decisions).

| Signal Type | Where | What It Reveals |
|---|---|---|
| Commit messages | `git log` | Communication style (terse vs. detailed), commit granularity preference |
| Commit size/frequency | `git log --stat` | Risk tolerance (big rewrites vs. small increments) |
| PR descriptions | GitHub/GitLab API | Explanation depth, documentation preference |
| Code review comments | GitHub/GitLab API | Quality standards, what they push back on |
| Revert frequency | `git log --grep="revert"` | Risk tolerance signal |
| Branch lifetime | `git branch -a` + merge dates | Exploration tendency (long-lived experiments vs. quick merges) |

**Recommendation:** Git history should be a **Phase 2 data source**. It requires different extraction logic (not a conversation transcript) and a separate analyzer prompt. But it's high-value because it captures behavior from ALL tools the user has ever used, regardless of whether those tools store transcripts.

### 1.4 Recommended Implementation Order

| Phase | Sources | Why |
|---|---|---|
| Phase 1 (current) | Claude Code JSONL | Already working. Ship and validate the core loop. |
| Phase 2 | OpenClaw JSONL, Codex CLI JSONL | Same JSONL family, adapter is straightforward. |
| Phase 3 | Cursor SQLite, Copilot JSON | Requires SQLite/JSON parsing, more effort per adapter. |
| Phase 4 | Git history | Different extraction model, high cross-tool value. |
| Phase 5 | Aider Markdown, Windsurf, Gemini | Long tail of tools, community-contributed adapters. |


## 2. Trigger Mechanisms -- When to Analyze

### 2.1 Current: SessionEnd Hook

Works for Claude Code via the plugin hook system. The session-end hook receives `transcript_path` on stdin and runs the full pipeline.

**Limitation:** Only fires for Claude Code. Other tools don't have equivalent hook systems (Codex has non-interactive mode but no post-session hooks; Cursor has no plugin hook API).

### 2.2 Proposed: Hybrid Trigger Architecture

```
┌─────────────────────────────────────────────────┐
│                 Trigger Layer                     │
│                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────┐│
│  │ Hook Triggers │  │ Watch Trigger│  │ Manual  ││
│  │ (per-tool)    │  │ (periodic)   │  │ Trigger ││
│  └──────┬───────┘  └──────┬───────┘  └────┬────┘│
│         │                 │               │      │
│         ▼                 ▼               ▼      │
│  ┌──────────────────────────────────────────────┐│
│  │           Deduplication Gate                  ││
│  │  (track processed session IDs)               ││
│  └──────────────────┬───────────────────────────┘│
│                     │                             │
│                     ▼                             │
│           ┌─────────────────┐                     │
│           │  Analysis Queue  │                     │
│           └─────────────────┘                     │
└─────────────────────────────────────────────────┘
```

**A. Hook triggers** (real-time, per tool that supports it)
- Claude Code: SessionEnd hook (current, keep)
- OpenClaw: If it supports post-session hooks, add one
- Others: not available

**B. Watch trigger** (periodic batch)
- A background scan that runs periodically (e.g., daily via cron/launchd, or on `your-taste sync`)
- Scans known directories for new/modified transcript files
- Compares file modification times against a `~/.your-taste/last-scan.json` index
- Processes only new sessions since last scan

```js
// ~/.your-taste/last-scan.json
{
  "claude-code": {
    "last_scan": "2026-02-27T00:00:00Z",
    "processed_sessions": ["session-abc", "session-def"]
  },
  "codex": {
    "last_scan": "2026-02-26T00:00:00Z",
    "processed_sessions": ["rollout-001"]
  }
}
```

**C. Manual trigger**
- `your-taste analyze` CLI command
- Scans all sources, processes everything unprocessed
- Useful after installing the tool for the first time

### 2.3 Cold Start: Bootstrapping Preferences Quickly

The cold start problem is real. A new user gets no value until they've had several sessions with enough decision moments. Three approaches, ranked by effort/value:

**Option A: Analyze existing transcripts (recommended first)**

When a user installs your-taste, run a one-time backfill:

```
your-taste init
  → Scan ~/.claude/projects/ for existing JSONL transcripts
  → Scan ~/.codex/sessions/ for existing sessions
  → Process the last N sessions (e.g., 20) through the analyzer
  → Bootstrap a profile immediately
```

This is the highest-value, lowest-friction approach. No user input needed. Most users already have dozens of sessions. Processing 20 past sessions would give confidence > 60% on most dimensions.

**Cost estimate:** 20 sessions x ~2K tokens per Haiku call = ~40K tokens = ~$0.01 total. Trivial.

**Option B: Seed from CLAUDE.md / .cursorrules / conventions files**

Many power users already have preference-like statements in their instruction files:
- CLAUDE.md: "Short, direct" / "Quality first" / "Delete dead code"
- .cursorrules: Similar instruction files for Cursor
- .aider.conf.yml: Aider conventions

A lightweight prompt could extract dimension signals from these files:

```
"Given this user's instructions to AI tools, estimate their preference dimensions..."
```

This is less reliable than actual behavioral signals (people say one thing, do another) but provides useful priors. Implementation: a one-time `seed-from-config` step during `your-taste init`.

**Option C: Onboarding interview (5 questions)**

Ask the user directly. Quick forced-choice questions like:

```
1. When refactoring, do you prefer:
   a) Gradual migration with backward compatibility
   b) Clean break - rip out old, put in new

2. When AI responds, do you prefer:
   a) Brief, action-first answers
   b) Detailed explanations with reasoning
```

Map answers directly to dimension scores with low initial confidence (e.g., 20%).

**Pros:** Immediate profile, zero API cost, works without any history.
**Cons:** Friction. People hate surveys. Self-reported preferences are often inaccurate.
**Verdict:** Offer as optional, not required. Never block installation on it.

**Option D: Import from shared archetype**

Pre-built profiles like "The Pragmatist" or "The Craftsman":

```yaml
# archetypes/pragmatist.yaml
risk_tolerance: { score: 0.7, confidence: 0.15 }
complexity_preference: { score: 0.3, confidence: 0.15 }
quality_vs_speed: { score: 0.3, confidence: 0.15 }
```

**Verdict:** Nice for marketing/onboarding demos. Low confidence scores mean real behavior overrides them quickly. Worth doing but low priority.

**Recommended cold start flow:**

```
your-taste init
  1. Scan for existing transcripts → backfill (best signal)
  2. Scan for CLAUDE.md/.cursorrules → seed priors (supplementary)
  3. If still empty, offer optional 5-question survey
  4. If user skips everything, start from default (0.5 scores, 0 confidence)
```

### 2.4 Experienced User: When to Stop Analyzing

After many sessions, additional analysis has diminishing returns. Each new session barely moves a dimension that already has 50+ evidence points.

**Approach: Adaptive analysis frequency**

```js
function shouldAnalyzeSession(profile) {
  const maxConfidence = Math.max(
    ...Object.values(profile.dimensions).map(d => d.confidence)
  );

  // Phase 1: Profile building (< 10 sessions analyzed)
  // → Analyze every session
  if (totalEvidence(profile) < 10) return true;

  // Phase 2: Profile refinement (10-50 sessions)
  // → Analyze sessions that seem substantive (> 10 messages)
  if (totalEvidence(profile) < 50) return 'if_substantive';

  // Phase 3: Mature profile (50+ sessions)
  // → Only analyze when contradictions detected or on manual trigger
  return 'on_contradiction_only';
}
```

**Contradiction detection:** Compare recent session signals against established profile. If a session suggests risk_tolerance = 0.8 but the profile has converged on 0.3, that's worth analyzing — preferences may be shifting.

**Cost optimization at scale:**
- Phase 1-2: ~$0.0005 per session (Haiku call). Negligible.
- Phase 3: Near-zero — most sessions skipped.
- Annual cost for a heavy user (500 sessions/year): ~$0.25 if every session is analyzed. Not worth optimizing aggressively.


## 3. Storage Architecture -- Local vs Cloud

### 3.1 Current: Local YAML

```yaml
# ~/.your-taste/profile.yaml
version: 1
dimensions:
  risk_tolerance:
    score: 0.72
    confidence: 0.83
    evidence_count: 14
    last_updated: "2026-02-27"
    summary: "Prefers clean breaks over gradual migration"
  # ...
observations:
  - date: "2026-02-27"
    dimension: risk_tolerance
    direction: bold
    evidence: "Chose full replacement over compatibility shim"
```

File size: ~2-5 KB. This is tiny. The sync problem is simpler than it looks.

### 3.2 Cross-Machine Sync Options

| Approach | Complexity | Offline Support | Conflict Handling | Setup Friction |
|---|---|---|---|---|
| **Git dotfiles repo** | Low | Full | Git merge | Medium (one-time) |
| **Symlink to cloud storage** | Low | Depends on provider | Last-write-wins | Low |
| **chezmoi** | Medium | Full | Three-way merge | Medium |
| **Dedicated cloud service** | High | Partial | Server-resolved | Low |
| **Evidence-based merge** | Medium | Full | Automatic (no conflicts) | Low |

#### Option A: Git Dotfiles Repo (simple, proven)

User adds `~/.your-taste/` to their dotfiles repo:

```bash
# In dotfiles repo
ln -s ~/dotfiles/your-taste ~/.your-taste
```

**Pros:**
- Zero infrastructure. Works with any git host.
- Full version history of profile evolution.
- Users who care about cross-machine sync already have dotfiles repos.

**Cons:**
- Manual push/pull. Profile doesn't auto-sync.
- Git merge conflicts on concurrent edits (rare but annoying).
- Requires git literacy.

**Verdict:** Document as the "zero-effort" sync option. Good enough for most users.

#### Option B: Symlink to Cloud Storage

Point `YOUR_TASTE_DIR` at a Dropbox/iCloud/Google Drive folder:

```bash
export YOUR_TASTE_DIR="$HOME/Library/Mobile Documents/com~apple~CloudDocs/your-taste"
```

**Pros:** Fully automatic sync. Zero manual steps after setup.
**Cons:** Last-write-wins. If two machines update simultaneously, one update is lost. Cloud provider dependency.

**Verdict:** Fine for users with a single primary machine and occasional secondary use. The race condition is rare for a file that updates at most once per session.

#### Option C: Evidence-Based Merge (recommended for v2)

This is the key architectural insight: **the profile is not a document to be synced -- it's a set of statistical estimates derived from evidence. Evidence can be merged without conflict.**

Instead of syncing the profile YAML directly, sync the **observations** (evidence log) and recompute the profile from evidence.

```
Machine A: analyzes sessions → appends to evidence log → computes profile
Machine B: analyzes sessions → appends to evidence log → computes profile
                    ↓
            Sync evidence logs (append-only, no conflicts)
                    ↓
            Recompute profile from merged evidence
```

**Evidence log format:**

```jsonl
{"id":"ev-001","ts":"2026-02-27T01:00:00Z","machine":"macbook","dim":"risk_tolerance","score":0.8,"direction":"bold","evidence":"Chose clean break over migration"}
{"id":"ev-002","ts":"2026-02-27T02:00:00Z","machine":"workstation","dim":"communication_style","score":0.2,"direction":"direct","evidence":"Rejected verbose explanation"}
```

**Why this works without conflicts:**
- Evidence entries are immutable append-only records
- Each has a unique ID (UUID or machine+timestamp)
- Merging = union of all evidence from all machines
- Profile recomputation is deterministic: same evidence set always produces same profile
- No "conflict" is possible — two machines observing different sessions produce complementary evidence

**Sync mechanism:** The evidence log can be synced via any append-friendly method:
- Git (append-only files merge cleanly)
- Cloud storage (concatenate, deduplicate by ID)
- Simple rsync between machines

**This is the CRDT-native approach.** An append-only evidence set is a G-Set (grow-only set) CRDT. The profile computation is a pure function over the set. Convergence is guaranteed.

```
┌──────────────────────────────────────────┐
│            ~/.your-taste/                 │
│                                           │
│  evidence/                                │
│    evidence.jsonl    ← append-only log    │
│                                           │
│  profile.yaml        ← computed, cached   │
│                          (can regenerate)  │
│                                           │
│  config.yaml         ← user preferences   │
│                          (manual edits)    │
│                                           │
│  last-scan.json      ← per-machine state  │
│                          (not synced)      │
└──────────────────────────────────────────┘
```

`profile.yaml` becomes a **derived cache**. If deleted, it's rebuilt from `evidence.jsonl`. The evidence log is the source of truth.

### 3.3 Cross-Platform Portability

The profile should work identically across Claude Code, OpenClaw, Codex, and any future tool. This requires:

**A. A standard profile format that any tool can consume.**

The current YAML format is already tool-agnostic. Any AI tool that reads YAML can use it. The key requirement is a clear spec:

```yaml
# Profile spec v1
# Any AI tool should read this and adapt its behavior accordingly.
version: 1
dimensions:
  risk_tolerance:      # 0.0 = cautious, 1.0 = bold
    score: 0.72
    confidence: 0.83   # Only act on dimensions with confidence > 0.3
```

**B. Injection points per tool.**

Each tool needs a way to read the profile at session start:

| Tool | Injection Mechanism |
|---|---|
| Claude Code | SessionStart hook reads profile, outputs to CLAUDE.md or system prompt |
| OpenClaw | IDENTITY.md or HEARTBEAT.md includes profile summary |
| Codex CLI | `codex.md` or system instructions include profile |
| Cursor | `.cursorrules` includes profile summary |
| Aider | `--read` flag points to a profile summary file |
| Gemini CLI | `GEMINI.md` or system instruction |

**Practical approach:** Generate a `~/.your-taste/profile-summary.txt` alongside the YAML — a human-readable, AI-consumable summary that can be appended to any tool's instruction file:

```
# Auto-generated by your-taste. Do not edit manually.
# Your decision-making style profile:
#
# Risk Tolerance: Bold (0.72, high confidence)
#   → Prefers clean breaks over gradual migration
# Communication: Direct (0.25, high confidence)
#   → Brief answers, action-oriented
# Complexity: Minimalist (0.35, medium confidence)
#   → Fewer abstractions, simpler solutions
```

Tools that support native integration (Claude Code plugin) get richer behavior. Tools without plugin support get the text summary via their instruction file mechanism.

### 3.4 Conflict Resolution Summary

| Scenario | Approach |
|---|---|
| Two machines analyze different sessions | No conflict. Evidence merge (union of observations). |
| User manually edits profile on machine A while machine B auto-updates | Manual edits stored separately in `config.yaml` (overrides). Auto-updates in evidence log. No conflict. |
| Same session analyzed twice (e.g., hook fires + batch scan) | Deduplication by session ID in evidence log. |
| User wants to reset a dimension | Add a "reset" event to evidence log. Recomputation ignores prior evidence for that dimension. |
| Profile format version upgrade | Migration function in code. Evidence log is version-independent. |


## 4. Recommended Architecture (Summary)

### Phase 1: Ship Current (Claude Code only)

Keep the existing architecture. It works. Focus on validating that the preference signals are accurate and useful.

```
Claude Code SessionEnd → parse JSONL → filter PII → Haiku analysis → update profile.yaml
Claude Code SessionStart → read profile.yaml → inject into session
```

Changes from current:
- Add `last-scan.json` to track processed sessions (enables idempotent re-runs)
- Add evidence log alongside profile.yaml (prepare for merge-based sync)

### Phase 2: Multi-Source + Cold Start

- Add adapters for OpenClaw (JSONL) and Codex CLI (JSONL)
- Add `your-taste init` command with backfill from existing transcripts
- Add `your-taste sync` manual trigger for batch processing
- Add CLAUDE.md / .cursorrules seed parsing for initial priors
- Generate `profile-summary.txt` for cross-tool injection

### Phase 3: Evidence-Based Sync

- Switch from direct profile updates to evidence-log-based architecture
- Profile becomes a derived cache, recomputed from evidence
- Document git-based sync and cloud-storage sync approaches
- Add adaptive analysis frequency (skip sessions when profile is mature)

### Phase 4: Git History + Extended Sources

- Git commit/PR analyzer (separate prompt, not conversation-based)
- Cursor SQLite adapter
- GitHub Copilot JSON adapter
- Community adapter API for third-party contributions

### Phase 5: Profile Portability Ecosystem

- Standard profile spec published (versioned, documented)
- Integration guides for each major AI coding tool
- Optional onboarding interview for users without history
- Archetype profiles for quick-start


## Sources

- [OpenClaw CLI Reference](https://docs.openclaw.ai/cli)
- [OpenClaw Architecture Overview](https://ppaolo.substack.com/p/openclaw-system-architecture-overview)
- [OpenClaw Session Storage (JSONL ingestion)](https://github.com/openclaw/openclaw/issues/7783)
- [Codex CLI Features](https://developers.openai.com/codex/cli/features/)
- [Codex CLI Session Transcripts](https://github.com/openai/codex/issues/2765)
- [Codex CLI Reference](https://developers.openai.com/codex/cli/reference/)
- [Cursor Chat History Storage](https://forum.cursor.com/t/chat-history-folder/7653)
- [Cursor Chat Export Guide](https://forum.cursor.com/t/guide-5-steps-exporting-chats-prompts-from-cursor/2825)
- [Cursor Data Storage Structure](https://zread.ai/S2thend/cursor-history/6-cursor-data-storage-structure)
- [Windsurf Chat Export](https://github.com/Exafunction/codeium/issues/127)
- [Gemini CLI Session Management](https://geminicli.com/docs/cli/session-management/)
- [GitHub Copilot Chat History Location](https://github.com/orgs/community/discussions/69740)
- [VS Code Settings Sync](https://code.visualstudio.com/docs/configure/settings-sync)
- [ai-data-extraction (universal extractor)](https://github.com/0xSero/ai-data-extraction)
- [chezmoi Multi-Machine Design](https://www.chezmoi.io/user-guide/frequently-asked-questions/design/)
- [Claude Code Settings Sync](https://code.claude.com/docs/en/settings)
- [Claude Sync Tool](https://medium.com/codex/sync-your-claude-code-sessions-across-all-devices-2e407c2eb160)
- [CCMS - Claude Code Machine Sync](https://github.com/miwidot/ccms)
- [Aider Chat History](https://aider.chat/docs/faq.html)
