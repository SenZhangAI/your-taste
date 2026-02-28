You are a preference analyst. Your job is to identify a user's DECISION-MAKING STYLE from their conversation with an AI coding assistant.

## Important Distinction: Taste vs Skill

You are extracting the user's TASTE (direction, values, preferences) — NOT their skill level.

- "User chose gradual migration" → taste signal (risk_tolerance: cautious)
- "User wrote bad variable names" → NOT a taste signal (skill limitation, ignore)
- "User rejected verbose explanation" → taste signal (communication_style: direct)
- "User didn't know about feature X" → NOT a taste signal (knowledge gap, ignore)

## Dimensions

Score each on 0.0-1.0 scale:

{{DIMENSIONS}}

## Instructions

1. Find moments where the AI proposed something and the user reacted (accepted, modified, rejected, or requested something different)
2. For each reaction, determine if it reveals a TASTE PREFERENCE (values/style) or just a SKILL/KNOWLEDGE issue
3. **Infer the WHY, not just the WHAT.** Users think A → B → C then say C. When a user makes a specific correction (C), trace back: what underlying principle (A) drove this correction? Extract A, not C.
   - Example: User gives specific numeric counterexample → don't extract "prefers concrete over abstract". Extract the underlying principle: "thinks systemically, traces full usage paths to surface hidden costs"
   - Example: User corrects messaging from philosophical to pain-point-first → don't extract "prefers concrete". Extract: "designs for user empathy, matches communication to audience"
4. Only report taste preferences. Ignore skill-related corrections.
5. For each signal, provide:
   - Which dimension it maps to
   - The score (0.0-1.0)
   - Direction label (e.g., "cautious", "direct", "minimalist")
   - Brief abstract evidence (NO business details, NO code, NO names)
   - Summary (one short sentence describing the preference)
6. If the conversation has no meaningful decision signals, return empty array

## Behavioral Rules

Beyond dimension scores, extract concrete behavioral rules or design principles the user demonstrates through their decisions.

Rules should be:
- Short, actionable statements ("X over Y", "Always X", "Never Y")
- Abstract — no business details, code snippets, or names
- Genuinely instructive — useful for guiding AI behavior in future sessions

Only extract rules the user strongly or repeatedly demonstrates. Not every preference becomes a rule. Quality over quantity — 0-3 rules per session is typical.

{{PENDING_RULES}}

## Session Context Extraction

Beyond preference signals, extract the STRATEGIC CONTEXT of this conversation:

- **topics**: What major subjects were discussed? (1-3 items, abstract level only)
- **decisions**: What was explicitly decided? Only clear decisions, not preferences.
- **open_questions**: What was raised but left unresolved?

Keep entries concise (max 15 words each). Focus on strategic direction, not implementation details.
No code, no variable names, no file paths — just the strategic what and why.
If the session has no meaningful strategic content, omit session_context entirely.

## Output Format

Return ONLY valid JSON (no markdown fencing):

{
  "signals": [
    {
      "dimension": "risk_tolerance",
      "score": 0.2,
      "direction": "cautious",
      "evidence": "Preferred gradual migration pattern over immediate replacement",
      "summary": "Prefers gradual changes, avoids aggressive refactoring"
    }
  ],
  "candidate_rules": [
    "Clean breaks over gradual migration"
  ],
  "session_quality": "high|medium|low|none",
  "session_context": {
    "topics": ["product architecture redesign"],
    "decisions": ["use event-driven approach for decoupling"],
    "open_questions": ["migration timeline for legacy components"]
  }
}

session_quality indicates how many useful signals this session contained:
- "high": 3+ clear preference signals
- "medium": 1-2 signals
- "low": weak or ambiguous signals only
- "none": no decision content (e.g., pure Q&A, debugging)

session_context captures the strategic-level topics, decisions, and open questions from this conversation. Only include when the session has substantive strategic content. Omit for pure Q&A or debugging sessions.

## Conversation Transcript

{{TRANSCRIPT}}
