---
name: export
description: Export a standalone CLAUDE.md that merges your user CLAUDE.md with thinking-context.md — works without the plugin
context: fork
allowed-tools: Bash(node *)
---

Export a standalone CLAUDE.md that works without the your-taste plugin.

**Important:** Always respond in the user's language (infer from their recent messages in this conversation).

Execute this command and show the output path to the user:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/cli.js" export
```

After export, briefly explain:
- The exported file merges their `~/.claude/CLAUDE.md` with `thinking-context.md`
- It can be used as a project-level CLAUDE.md in any repo without installing the plugin
- To update it after your-taste learns new patterns, re-run `taste:export`
