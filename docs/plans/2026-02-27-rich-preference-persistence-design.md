# Rich Preference Persistence Design

> Solving the lossy compression problem: scores alone can't drive meaningful AI behavior.

## Problem

v0.1 compresses all preference information into 6 float scores. A score of `risk_tolerance: 0.78` loses critical context:

- "Clean breaks over gradual migration. Rip out the old, put in the new." → lost
- "No legacy compatibility shims unless there's a running production dependency." → lost
- "Chinese in business logic comments. English for technical/infrastructure." → impossible to reconstruct from any score

When AI enters a new session with only scores, it must guess what "0.78 bold" means in context. Different sessions interpret this differently, producing inconsistent behavior.

**The real product output should be natural language behavioral instructions** — like a well-maintained CLAUDE.md, but generated automatically from observed behavior.

## Design

### Three-Layer Storage Architecture

```
┌─────────────────────────────────────────────────┐
│  profile.yaml (machine layer)                    │
│  Scores + confidence + evidence counts           │
│  → Tracking, gating, visualization, taste show   │
├─────────────────────────────────────────────────┤
│  taste.md (human + AI shared layer)              │
│  Behavioral rules + design philosophy            │
│  → AI follows these / user can read and edit     │
├─────────────────────────────────────────────────┤
│  additionalContext (injection layer)             │
│  SessionStart pushes taste.md content to AI      │
│  → Invisible, automatic, every session           │
└─────────────────────────────────────────────────┘
```

**profile.yaml** — quantitative tracking (existing)
- Dimension scores, confidence, evidence counts, timestamps
- Used by `taste show` for visualization
- Used for confidence gating (< 0.3 → silent)

**taste.md** — the actual product output (new)
- Natural language behavioral rules and design philosophy
- Human-readable, human-editable
- AI consumes via additionalContext injection
- Survives plugin uninstall (user keeps the file)
- Cross-platform portable (any tool can read it)

**pending.yaml** — candidate rules awaiting review (new)
- Rules extracted but not yet user-approved
- Tracks seen_count, first/last seen dates, evidence

### taste.md Structure

```markdown
# Your Taste

## Design Philosophy
- The codebase is the primary interface between human and AI across sessions.
- Design docs record WHY, not just WHAT.
- Correctness > Performance > Readability > Brevity

## Behavioral Rules
- Clean breaks over gradual migration. Rip out the old, put in the new.
- Naming > comments. If you need a comment, the name is wrong.
- Delete dead code completely. It hurts future context comprehension.
- Chinese in business logic comments. English for technical/infrastructure.

## Working Style
- Default mode: act, don't ask. Only pause on irreversible decisions.
- Recommend one best approach. Don't list 5 options.
- Lead with action or answer. Don't repeat the question.
```

Three sections serve different purposes:

| Section | What | Example |
|---------|------|---------|
| Design Philosophy | Meta-level thinking, guides HOW to think | "Design docs record WHY, not just WHAT" |
| Behavioral Rules | Concrete instructions, guides WHAT to do | "Naming > comments" |
| Working Style | Collaboration mode, guides HOW to interact | "Recommend one best approach" |

### Extraction Pipeline Changes

Current SessionEnd output:
```json
{"signals": [{"dimension": "risk_tolerance", "score": 0.8, "evidence": "..."}]}
```

Extended output:
```json
{
  "signals": [...],
  "candidate_rules": [
    {
      "rule": "Prefer clean rewrites over gradual migration for application code",
      "basis": "User rejected compatibility shim, chose full replacement",
      "category": "behavioral_rules"
    }
  ],
  "candidate_philosophy": [
    {
      "philosophy": "Design docs should record WHY, not just WHAT",
      "basis": "User added decision rationale when AI only wrote conclusions"
    }
  ]
}
```

Haiku extraction prompt is extended to produce candidate rules and philosophy statements alongside dimension scores. Not every session yields candidates — that's fine.

### Silent Collection → Interactive Review

**Phase 1: Silent accumulation**

Each SessionEnd, candidate rules are appended to pending.yaml:

```yaml
rules:
  - rule: "Clean breaks over gradual migration"
    seen_count: 3
    first_seen: "2026-02-20"
    last_seen: "2026-02-27"
    category: "behavioral_rules"
    basis:
      - "Rejected compatibility shim, chose full replacement"
      - "Rewrote legacy module instead of wrapping it"
      - "Told AI to rip out old code, not patch"
```

Deduplication: Haiku compares new candidates against existing pending rules to determine if a candidate is new or additional evidence for an existing rule.

**Phase 2: Interactive review**

When a rule reaches threshold (3 occurrences across different sessions):

SessionStart status line:
```
your-taste: 2 new preferences discovered. Run `taste review` to see them.
```

`taste review` shows pending rules with three actions:
- **Accept** → write to taste.md, effective next session
- **Edit** → user refines wording, then write to taste.md
- **Dismiss** → discard, mark as rejected, don't re-propose

**Why threshold of 3?**
- 1 occurrence may be situational (rushed this time, chose the fast option)
- 3 occurrences across different sessions = stable preference
- Consistent with Bayesian confidence logic (multiple consistent signals)

**Why not auto-approve?**
- Natural language rules may be imprecise (Haiku's wording vs. user's intent)
- Wrong rules injected into every future session cause persistent harm
- Review is the "Understood, not just analyzed" principle in action — user shapes their own profile

### Injection Mechanism

SessionStart hook:

```javascript
// Primary: inject taste.md content
const taste = fs.readFileSync(tastePath, 'utf-8');

// Fallback: if no taste.md, use template-rendered instructions from scores
const instructions = taste || renderFromScores(profile);

console.log(JSON.stringify({
  hookSpecificOutput: {
    additionalContext: instructions
  }
}));
```

taste.md content takes priority. Template-rendered instructions from scores serve as fallback for early-stage profiles with no accumulated rules yet.

### User Can Edit taste.md Directly

taste.md is a plain markdown file the user owns. Manual edits and auto-approved rules coexist. your-taste only manages entries that came through the review pipeline (tracked internally). User-added entries are never touched.

## Version Phasing

**v0.2 — Template-first (ship and validate)**
- Instruction renderer (scores → template → instructions)
- additionalContext injection
- Backfill init
- taste show + personality narratives

**v0.3 — Rules replace templates**
- Haiku prompt extension (extract candidate rules + philosophy)
- pending.yaml accumulation logic
- `taste review` command
- taste.md generation and injection (becomes primary channel)
- Template rendering becomes fallback only

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Where to store rules | Dedicated taste.md, not CLAUDE.md | Non-invasive, user owns the file, portable |
| When to involve user | After 3 consistent signals | Balances accuracy with zero-effort promise |
| Auto-approve? | No, always review | Wrong rules cause persistent harm; user agency matters |
| Template vs rules | Coexist, rules take priority | Templates are fallback for early profiles |
| taste.md editability | User can freely edit | Respects user agency; hand-written and auto-generated rules equal |
