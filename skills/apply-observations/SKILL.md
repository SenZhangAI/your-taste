---
name: apply-observations
description: Apply learned observations to CLAUDE.md with diff preview
allowed-tools: Read, Edit, Write, AskUserQuestion
---

Apply learned observations from your-taste to CLAUDE.md files.

**Important:** Always respond in the user's language (infer from their recent messages in this conversation).

## Steps

1. Read the observations file:
   - Read `~/.your-taste/observations.md`
   - If the file doesn't exist or is empty, tell the user: "No observations yet — run taste:init first to scan your sessions." Then stop.

2. Read existing CLAUDE.md files:
   - Read `~/.claude/CLAUDE.md` (global — should always exist)
   - Read the current project's CLAUDE.md if it exists (check common locations: `./CLAUDE.md`, then parent directories up to git root)
   - Note the full content of each file, paying attention to any existing `<!-- your-taste:start -->` ... `<!-- your-taste:end -->` sections

3. Also read `~/.your-taste/taste.md` if it exists — include its rules as migration candidates.

4. Analyze observations.md and extract actionable rules for CLAUDE.md:

   **Source priority:**
   - **Suggested Rules section**: Direct candidates — already in concise rule format
   - **Working Principles section**: Extract the core principle as a one-line rule (drop evidence and examples)
   - **Common Misreads section**: Convert to "Do NOT" rules (e.g., "Do not add compensation layers — trace to the root cause")
   - **Thinking Patterns section**: Generally skip — too detailed for CLAUDE.md, better served by observations.md via session-start hook injection

   **For each candidate rule:**
   - Check if CLAUDE.md already contains the same or substantially similar instruction (anywhere in the file, not just the your-taste section) — if so, skip it
   - Determine scope: mentions specific tech stack, project name, or domain → project-level; abstract principle → global-level
   - Rewrite if needed to match CLAUDE.md's directive style (imperative, concise)

   **taste.md migration:**
   - If taste.md has rules not yet in CLAUDE.md, include them as candidates
   - These are user-reviewed rules, so they have high confidence

5. If no new rules to suggest (all deduplicated), tell the user:
   "Your CLAUDE.md already reflects your current observations — no changes needed."
   Then stop.

6. Present the changes. For EACH target file (global CLAUDE.md first, then project CLAUDE.md if applicable):

   **If the file has no `<!-- your-taste:start -->` section yet:**
   - Use Edit tool to append the new section at the end of the file:
     ```
     <!-- your-taste:start -->
     ## Your Taste — Learned Preferences

     - rule 1
     - rule 2
     ...

     <!-- your-taste:end -->
     ```

   **If the file already has a `<!-- your-taste:start -->` section:**
   - Use Edit tool to update the section content (add new rules, keep existing ones)
   - The old_string should be the entire section from `<!-- your-taste:start -->` to `<!-- your-taste:end -->`
   - The new_string should be the updated section with new rules added

   The user will see each Edit as a diff preview and can accept or reject.

7. After all edits are presented, summarize what was applied:
   - How many rules were added to global CLAUDE.md
   - How many rules were added to project CLAUDE.md (if any)
   - Remind the user these will take effect on their next session

## Constraints

- Maximum 10 rules per run (avoid overwhelming the user)
- Do NOT modify any content outside the `<!-- your-taste:start/end -->` markers
- Do NOT delete rules the user previously accepted — only add new ones or suggest replacements for contradicted ones
- Do NOT create a project-level CLAUDE.md just for a few rules — only add to it if it already exists
- Keep rules concise: one line each, imperative voice
