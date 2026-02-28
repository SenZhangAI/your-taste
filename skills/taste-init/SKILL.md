---
name: taste-init
description: Scan past Claude Code sessions and build your taste profile instantly
context: fork
allowed-tools: Bash(node *)
---

Run the your-taste backfill to build a preference profile from past sessions.

Execute this command and show the full output to the user:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/cli.js" init
```

After it completes, tell the user their profile is ready and will be applied on the next session start.
