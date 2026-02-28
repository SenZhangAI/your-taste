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

4. When the background task completes and you are notified, show the user the results summary. If successful, tell them their profile has been built and will be automatically applied on their next session start.
