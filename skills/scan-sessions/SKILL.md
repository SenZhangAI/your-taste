---
name: scan-sessions
description: Scan past Claude Code sessions and extract reasoning insights
allowed-tools: Bash(node *)
---

Scan past Claude Code sessions to build a preference profile.

**This is a long-running background operation.** Follow these steps exactly:

**Important:** Always respond in the user's language (infer from their recent messages in this conversation).

1. Determine scan scope flags from the user's message:
   - Default (no qualifier): no extra flags (scans 50 most recent sessions)
   - `--deep` or "all sessions": `--all`
   - "last N days/weeks/months": `--days <N>` (convert weeks/months to days: 1 week = 7, 1 month = 30, 3 months = 90)
   - "N sessions": `--max <N>`
   - If the user specifies a concurrency number, use that instead of the default 2.

2. Run a **synchronous discover** call first to get session metadata:
   `node "${CLAUDE_PLUGIN_ROOT}/bin/cli.js" insights --discover [scope flags from step 1]`

   This outputs JSON: `{"toProcess": N, "skipped": N, "needPass1": N, "resumed": N, "oldest": "YYYY-MM-DD", "newest": "YYYY-MM-DD"}`

   Parse the JSON and tell the user:
   - How many sessions will be scanned and the time range (oldest ~ newest)
   - How many were already processed (skipped)
   - That the scan runs in background so they can keep working
   - **Time expectation:** Each session requires an LLM call. Estimate ~20 seconds per `needPass1` session (e.g., 50 sessions ≈ 15-20 min, 200+ sessions ≈ over an hour).

   If `toProcess` is 0, tell the user all sessions have already been processed and stop here.

3. Run the full scan command **in the background** (use run_in_background):
   `node "${CLAUDE_PLUGIN_ROOT}/bin/cli.js" insights --concurrency 2 [scope flags from step 1]`

4. When the background task completes and you are notified, present the results with an encouraging tone:
   - **Lead with what was learned**, not what's missing. Frame each discovered dimension as a concrete insight about the user's working style (e.g., "You prefer high autonomy — act first, confirm later" rather than just showing a number).
   - **First scan is a meaningful start.** Even 2-3 signals are valuable — the system now understands enough to start adapting. Frame it as "your-taste now knows X about you" not "only X signals found."
   - **Undiscovered dimensions are opportunities**, not gaps. "As we work together more, your-taste will pick up on your risk tolerance and quality standards too" — forward-looking, not deficit-focused.
   - Tell them the profile will be automatically applied on their next session start.

5. After presenting the scan results, invoke the `taste:apply-observations` skill to suggest CLAUDE.md updates based on the new observations. Say something like:

   "Now let me check if there are new insights to add to your CLAUDE.md..."

   Then invoke the skill. If the skill reports no changes needed, that's fine — don't treat it as an error.
