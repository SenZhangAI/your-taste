---
name: scan-sessions
description: Scan past Claude Code sessions and build your taste profile instantly
allowed-tools: Bash(node *)
---

Scan past Claude Code sessions to build a preference profile.

**This is a long-running background operation.** Follow these steps exactly:

**Important:** Always respond in the user's language (infer from their recent messages in this conversation).

1. Determine scan scope from the user's message:
   - Default (no qualifier): `node "${CLAUDE_PLUGIN_ROOT}/bin/cli.js" init`
     Scans the 50 most recent sessions. Fast, low cost.
   - `--deep` or "all sessions": `node "${CLAUDE_PLUGIN_ROOT}/bin/cli.js" init --all`
   - "last N days/weeks/months": `node "${CLAUDE_PLUGIN_ROOT}/bin/cli.js" init --days <N>`
     Convert weeks/months to days (1 week = 7, 1 month = 30, 3 months = 90).
   - "N sessions": `node "${CLAUDE_PLUGIN_ROOT}/bin/cli.js" init --max <N>`

2. Tell the user what scope you're scanning and that it runs in background so they can keep working.

3. Run the command **in the background** (use run_in_background).

4. When the background task completes and you are notified, present the results with an encouraging tone:
   - **Lead with what was learned**, not what's missing. Frame each discovered dimension as a concrete insight about the user's working style (e.g., "You prefer high autonomy — act first, confirm later" rather than just showing a number).
   - **First scan is a meaningful start.** Even 2-3 signals are valuable — the system now understands enough to start adapting. Frame it as "your-taste now knows X about you" not "only X signals found."
   - **Undiscovered dimensions are opportunities**, not gaps. "As we work together more, your-taste will pick up on your risk tolerance and quality standards too" — forward-looking, not deficit-focused.
   - Tell them the profile will be automatically applied on their next session start.

5. After presenting the scan results, invoke the `taste:apply-observations` skill to suggest CLAUDE.md updates based on the new observations. Say something like:

   "Now let me check if there are new insights to add to your CLAUDE.md..."

   Then invoke the skill. If the skill reports no changes needed, that's fine — don't treat it as an error.
