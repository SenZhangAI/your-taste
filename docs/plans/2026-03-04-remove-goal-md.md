# Remove goal.md Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the manual goal.md mechanism — project-level design principles will flow through proposals → CLAUDE.md instead.

**Architecture:** Pure deletion. Remove goal.js module, its tests, CLI command, lang templates, and all references in hooks. Update docs.

**Tech Stack:** Node.js, Vitest

---

### Task 1: Delete goal.js and its tests

**Files:**
- Delete: `src/goal.js`
- Delete: `tests/goal.test.js`

**Step 1: Delete files**

```bash
rm src/goal.js tests/goal.test.js
```

**Step 2: Run tests to check for import failures**

Run: `npx vitest run 2>&1 | tail -20`
Expected: FAIL — session-start.js, user-prompt.js, cli.js still import goal.js

**Step 3: Commit**

```bash
git add src/goal.js tests/goal.test.js
git commit -m "refactor: delete goal.js module and tests"
```

---

### Task 2: Remove goal from hooks

**Files:**
- Modify: `src/hooks/session-start.js`
- Modify: `src/hooks/user-prompt.js`
- Modify: `tests/session-start.test.js`
- Modify: `tests/user-prompt.test.js`

**Step 1: Update session-start.js**

Remove:
- Line 5: `import { loadGoal, renderGoalForInjection } from '../goal.js';`
- `goalContent` parameter from `buildAdditionalContext` signature (line 12)
- Lines 20-21: `renderGoalForInjection` call inside buildAdditionalContext
- Lines 38,43: `goalContent` variable and `loadGoal` call in main()
- Lines 54,56: `hasGoal` variable and debug log reference
- Line 58: `!hasGoal` from the early-exit condition
- Line 63: `goalContent` from buildAdditionalContext call
- Line 67: goal from parts array

New `buildAdditionalContext` signature: `(observationsContent, projectContextText)`

**Step 2: Update user-prompt.js**

Remove:
- Line 3: `import { loadGoal, renderGoalForInjection } from '../goal.js';`
- Lines 33-38: entire P2 goal block
- Line 57: P2 comment
- Line 62: `{ text: goalText, priority: 'P2', required: true }` from prioritized array

Update priority comments:
- P1: thinking framework (unchanged)
- P2: project context (was P3)
- P3: global context (was P4)

**Step 3: Update tests/session-start.test.js**

- Remove test "includes goal content when available" (lines 17-21)
- Remove test "combines observations + goal + context" (lines 29-37) — replace with "combines observations + context" test without goal parameter
- Update all `buildAdditionalContext` calls: remove the goal parameter (middle argument)

**Step 4: Update tests/user-prompt.test.js**

- Remove test "includes goal content when available" (lines 28-35)
- Update "drops lower-priority content" test (lines 84-94): remove goal.md creation, use only context.md for budget testing

**Step 5: Run tests**

Run: `npx vitest run`
Expected: All pass (minus deleted goal tests)

**Step 6: Commit**

```bash
git add src/hooks/session-start.js src/hooks/user-prompt.js tests/session-start.test.js tests/user-prompt.test.js
git commit -m "refactor: remove goal from hooks and hook tests"
```

---

### Task 3: Remove goal from CLI and lang templates

**Files:**
- Modify: `bin/cli.js`
- Modify: `src/lang.js`

**Step 1: Update bin/cli.js**

Remove:
- Line 6: `import { loadGoal, createGoalTemplate } from '../src/goal.js';`
- Lines 37-38: `else if (command === 'goal')` branch
- Line 58: help text for goal command
- Lines 252-254: goal loading and hasGoal in runStatus
- Line 258: goal status output line
- Lines 279-296: entire `runGoal` function

**Step 2: Update src/lang.js**

Remove goal template entries from all three language objects:
- en: lines 74-83 (goalHeader through goalRejectedDesc)
- zh: lines 99-107
- ja: lines 121-129

**Step 3: Run tests**

Run: `npx vitest run`
Expected: All pass

**Step 4: Commit**

```bash
git add bin/cli.js src/lang.js
git commit -m "refactor: remove taste goal command and lang templates"
```

---

### Task 4: Update documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`
- Modify: `ROADMAP.md`

**Step 1: Update CLAUDE.md**

- Three-Layer Injection section: remove goal from SessionStart and UserPromptSubmit descriptions
- Update injection numbering (CLAUDE.md native, SessionStart, UserPromptSubmit)

**Step 2: Update README.md**

- Remove `goal.md` from "How It Works" flow
- Remove `goal.md` from data directory listing
- Update hook descriptions to not mention goal

**Step 3: Update ROADMAP.md**

- Remove `goal.md` from current state file listing
- Remove goal from injection description
- Remove "Decision promotion → goal.md" and "Goal auto-suggestions" from future items (replaced by design principles → CLAUDE.md concept)

**Step 4: Commit**

```bash
git add CLAUDE.md README.md ROADMAP.md
git commit -m "docs: remove goal.md references from project docs"
```

---

### Task 5: Final verification

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All pass, test count reduced by 5 (goal.test.js had 5 tests)

**Step 2: Grep for stale references**

Run: `grep -rn 'goal\.md\|goal\.js\|loadGoal\|goalContent\|goalHeader\|createGoalTemplate\|runGoal\|renderGoalForInjection' --include='*.js' --include='*.md' src/ tests/ bin/ CLAUDE.md README.md ROADMAP.md`
Expected: No matches (or only this plan file and design doc)

**Step 3: Squash commits if desired, or leave as-is**
