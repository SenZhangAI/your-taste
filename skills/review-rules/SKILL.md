---
name: review-rules
description: Review and approve rule proposals for your CLAUDE.md
allowed-tools: Bash(node *), AskUserQuestion
---

Review rule proposals that your-taste has extracted from your sessions.

**Important:** Always respond in the user's language (infer from their recent messages in this conversation).

## Steps

1. Get proposals data:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/cli.js" review-data
```

2. Parse the `proposals` array from the output. If empty, tell the user:
   "No rule proposals yet. Keep using Claude Code and proposals will surface when patterns emerge."

3. For each proposal, present it to the user with:
   - The rule text
   - The evidence
   - The source (session file or taste:insights)
   Ask: "Accept, Edit, or Dismiss?"

4. Collect all decisions into this JSON format:
```json
{
  "accepted": ["rule text 1", "rule text 2"],
  "edited": [{"original": "old text", "revised": "user's edited text"}],
  "dismissed": ["rule text 3"]
}
```

5. Apply decisions:

```bash
echo '<the JSON above>' | node "${CLAUDE_PLUGIN_ROOT}/bin/cli.js" review-apply
```

6. Report results: how many rules were approved and added to CLAUDE.md.
