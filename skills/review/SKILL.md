---
name: review
description: Review and approve accumulated behavioral rules for your taste profile
allowed-tools: Bash(node *), AskUserQuestion
---

Review pending behavioral rules that your-taste has extracted from your sessions.

## Steps

1. Get pending rules data:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/cli.js" review-data
```

2. Filter rules with `count >= 3` from the output. These have been observed enough times to be meaningful.

3. If no rules qualify (all count < 3), tell the user:
   "No rules ready for review yet. Your behavioral patterns are still accumulating — keep using Claude Code and rules will surface when they appear consistently."

4. For each qualifying rule, present it to the user with:
   - The rule text
   - How many times it was observed (count)
   - Date range (first_seen to last_seen)
   Ask: "Accept, Edit, or Dismiss?"

5. Collect all decisions into this JSON format:
```json
{
  "accepted": ["rule text 1", "rule text 2"],
  "edited": [{"original": "old text", "revised": "user's edited text"}],
  "dismissed": ["rule text 3"]
}
```

6. Apply decisions:

```bash
echo '<the JSON above>' | node "${CLAUDE_PLUGIN_ROOT}/bin/cli.js" review-apply
```

7. Report results: how many rules were approved and added to taste.md.
