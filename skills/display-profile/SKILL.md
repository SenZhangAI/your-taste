---
name: display-profile
description: Display your taste profile with personality narratives
context: fork
allowed-tools: Bash(node *)
---

Show the user's taste profile.

**Important:** Always respond in the user's language (infer from their recent messages in this conversation).

Execute this command and show the full output to the user:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/cli.js" show
```
