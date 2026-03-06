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
   - If the file doesn't exist or is empty, tell the user: "No observations yet — run taste:insights first to scan your sessions." Then stop.

2. Read existing CLAUDE.md files:
   - Read `~/.claude/CLAUDE.md` (global — should always exist)
   - Read the current project's CLAUDE.md if it exists (check common locations: `./CLAUDE.md`, then parent directories up to git root)
   - Note the full content of each file, paying attention to any existing `<!-- your-taste:start -->` ... `<!-- your-taste:end -->` sections

3. Analyze observations.md and extract actionable rules for CLAUDE.md:

   **Source priority:**
   - **Suggested Rules section**: Direct candidates — already in concise rule format
   - **Working Principles section**: Extract the core principle as a one-line rule (drop evidence and examples)
   - **Common Misreads section**: Convert to "Do NOT" rules (e.g., "Do not add compensation layers — trace to the root cause")
   - **Thinking Patterns section**: Generally skip — too detailed for CLAUDE.md, better served by observations.md via session-start hook injection

   **For each candidate rule, apply strict deduplication:**
   - Check if CLAUDE.md already contains the **same underlying principle**, even if worded differently — if the existing instruction would already produce the same AI behavior, skip it
   - Example: if CLAUDE.md says "act, don't ask", a new rule "execute directly without exploratory rituals" is redundant — the principle is identical, only the phrasing differs
   - Only keep rules that teach something CLAUDE.md doesn't already cover — a genuinely new principle, not a restatement or specialization of an existing one

   **Scope and universality check — apply to every candidate:**
   - **Universality test**: Imagine a completely different project (different tech stack, different team size, different domain). Would this rule still be useful? If it only makes sense in a specific team structure, workflow, or technical architecture, it's project-level at best, or should be dropped entirely.
   - Examples of project-specific rules that should NOT go in global CLAUDE.md:
     - "Always use repository pattern for data access" → architecture pattern for one codebase
     - "Coordinate with team lead before modifying shared modules" → team workflow, not universal
     - "Use UTC timestamps in all API responses" → domain convention for one project
   - **Scope assignment**: If a rule passes the universality test, it's global. If it's useful but only in certain project types, it's project-level (only add if that project's CLAUDE.md exists). If it's a one-off scenario, drop it.
   - Rewrite if needed to match CLAUDE.md's directive style (imperative, concise)

4. If no new rules to suggest (all deduplicated), tell the user:
   "Your CLAUDE.md already reflects your current observations — no changes needed."
   Then stop.

5. Present candidates to the user for selection:

   First, briefly explain your deduplication results (e.g., "Compared observations against existing CLAUDE.md — most insights are already covered. These N are genuinely new:").

   Then use AskUserQuestion with one multiSelect question. Each candidate rule becomes an option:
   - **label**: The rule text itself (concise, imperative)
   - **description**: Why it's new — what gap in CLAUDE.md it fills (one sentence)

   If there are both global and project-level candidates, use two separate AskUserQuestion calls (one per target).

   Example:
   ```
   question: "Which rules should be added to your global CLAUDE.md?"
   header: "Rules"
   multiSelect: true
   options:
     - label: "Fix root causes directly — skip temporary mitigations"
       description: "New: CLAUDE.md covers 'clean breaks' for migrations but not debugging workflow"
     - label: "Prefer platform-native mechanisms over custom alternatives"
       description: "New: no existing instruction about build-vs-buy decisions"
   ```

   If the user selects none, say "No changes made" and stop.

6. Apply selected rules. For EACH target file:

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

7. After all edits are applied, summarize what was added:
   - How many rules were added to global CLAUDE.md
   - How many rules were added to project CLAUDE.md (if any)
   - Remind the user these will take effect on their next session

## Constraints

- Maximum 10 rules per run (avoid overwhelming the user)
- Do NOT modify any content outside the `<!-- your-taste:start/end -->` markers
- Do NOT delete rules the user previously accepted — only add new ones or suggest replacements for contradicted ones
- Do NOT create a project-level CLAUDE.md just for a few rules — only add to it if it already exists
- Keep rules concise: one line each, imperative voice
