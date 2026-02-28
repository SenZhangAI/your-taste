# v0.4 Project-Scoped Data Architecture Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor your-taste from a flat global context store to a project-scoped data architecture with goal.md (stable layer) and context.md (evolving layer), all in human-readable Markdown.

**Architecture:** Three new modules: (1) `src/project.js` for project directory management under `~/.your-taste/projects/<name>/`, (2) `src/goal.js` for reading project goal.md files, (3) refactored `src/context.js` from global YAML to project-scoped Markdown with FIFO decisions. Hooks updated to detect current project via `process.cwd()` and inject project-specific context with priority-based size budgeting.

**Tech Stack:** Node.js >=18, ESM modules, `yaml` package (for index.yaml only), `vitest` for tests. No new dependencies.

**Design Doc:** `docs/plans/2026-02-28-v04-context-accelerator-design.md` + `/Users/sen/ai/discuss/your-taste-upgrade-plan.md`

---

### Task 1: Project Directory Management — Tests

**Files:**
- Create: `tests/project.test.js`

**Reference:** Study `src/profile.js:5-7` for `getDir()` pattern using `process.env.YOUR_TASTE_DIR`.

**Step 1: Write project management tests**

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { parse } from 'yaml';
import {
  getProjectName,
  getProjectDir,
  ensureProjectDir,
} from '../src/project.js';

describe('project directory management', () => {
  let dir;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'taste-proj-'));
    process.env.YOUR_TASTE_DIR = dir;
  });

  afterEach(async () => {
    delete process.env.YOUR_TASTE_DIR;
    await rm(dir, { recursive: true });
  });

  it('derives project name from last path component', () => {
    expect(getProjectName('/Users/sen/ai/your-taste')).toBe('your-taste');
    expect(getProjectName('/Users/sen/ai/nuoshi-backend')).toBe('nuoshi-backend');
  });

  it('handles trailing slashes', () => {
    expect(getProjectName('/Users/sen/ai/your-taste/')).toBe('your-taste');
  });

  it('returns project dir path under YOUR_TASTE_DIR', () => {
    const result = getProjectDir('/Users/sen/ai/your-taste');
    expect(result).toBe(join(dir, 'projects', 'your-taste'));
  });

  it('creates project directory and updates index', async () => {
    const projectPath = '/Users/sen/ai/your-taste';
    const projectDir = await ensureProjectDir(projectPath);

    expect(projectDir).toBe(join(dir, 'projects', 'your-taste'));

    // index.yaml should map name → path
    const indexContent = await readFile(join(dir, 'projects', 'index.yaml'), 'utf8');
    const index = parse(indexContent);
    expect(index['your-taste']).toBe(projectPath);
  });

  it('reuses existing project directory on second call', async () => {
    const projectPath = '/Users/sen/ai/your-taste';
    await ensureProjectDir(projectPath);
    await ensureProjectDir(projectPath);

    const indexContent = await readFile(join(dir, 'projects', 'index.yaml'), 'utf8');
    const index = parse(indexContent);
    // Should still have one entry, not duplicated
    expect(Object.keys(index)).toHaveLength(1);
  });

  it('handles name collision by appending path hash', async () => {
    await ensureProjectDir('/Users/sen/project-a/myapp');
    await ensureProjectDir('/Users/sen/project-b/myapp');

    const indexContent = await readFile(join(dir, 'projects', 'index.yaml'), 'utf8');
    const index = parse(indexContent);
    // Both should exist, second gets a suffix
    expect(Object.keys(index)).toHaveLength(2);
    expect(index['myapp']).toBe('/Users/sen/project-a/myapp');
    // Second one has hash suffix
    const keys = Object.keys(index).filter(k => k.startsWith('myapp'));
    expect(keys).toHaveLength(2);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/sen/ai/your-taste && npx vitest run tests/project.test.js`
Expected: FAIL — `src/project.js` doesn't exist yet.

**Step 3: Commit test file**

```bash
cd /Users/sen/ai/your-taste
git add tests/project.test.js
git commit -m "test: add project directory management tests"
```

---

### Task 2: Project Directory Management — Implementation

**Files:**
- Create: `src/project.js`

**Step 1: Implement project.js**

```javascript
import { readFile, writeFile, mkdir } from 'fs/promises';
import { parse, stringify } from 'yaml';
import { basename, join } from 'path';
import { createHash } from 'crypto';

function getDir() {
  return process.env.YOUR_TASTE_DIR || `${process.env.HOME}/.your-taste`;
}

function getProjectsDir() {
  return join(getDir(), 'projects');
}

function getIndexPath() {
  return join(getProjectsDir(), 'index.yaml');
}

export function getProjectName(projectPath) {
  // Strip trailing slash, take last component
  const cleaned = projectPath.replace(/\/+$/, '');
  return basename(cleaned);
}

export function getProjectDir(projectPath) {
  const name = getProjectName(projectPath);
  return join(getProjectsDir(), name);
}

async function loadIndex() {
  try {
    const content = await readFile(getIndexPath(), 'utf8');
    return parse(content) || {};
  } catch {
    return {};
  }
}

async function saveIndex(index) {
  await mkdir(getProjectsDir(), { recursive: true });
  await writeFile(getIndexPath(), stringify(index), 'utf8');
}

export async function ensureProjectDir(projectPath) {
  const name = getProjectName(projectPath);
  const index = await loadIndex();

  // Check if this exact project path is already indexed
  for (const [key, path] of Object.entries(index)) {
    if (path === projectPath) {
      const dir = join(getProjectsDir(), key);
      await mkdir(dir, { recursive: true });
      return dir;
    }
  }

  // New project — check for name collision
  let dirName = name;
  if (index[name] && index[name] !== projectPath) {
    // Name collision: append short hash of full path
    const hash = createHash('md5').update(projectPath).digest('hex').slice(0, 6);
    dirName = `${name}-${hash}`;
  }

  index[dirName] = projectPath;
  await saveIndex(index);

  const dir = join(getProjectsDir(), dirName);
  await mkdir(dir, { recursive: true });
  return dir;
}
```

**Step 2: Run tests**

Run: `cd /Users/sen/ai/your-taste && npx vitest run tests/project.test.js`
Expected: All 6 tests PASS.

**Step 3: Run full suite to verify no regressions**

Run: `cd /Users/sen/ai/your-taste && npx vitest run`
Expected: All existing tests still PASS.

**Step 4: Commit**

```bash
cd /Users/sen/ai/your-taste
git add src/project.js tests/project.test.js
git commit -m "feat: add project directory management with name-based dirs and index"
```

---

### Task 3: Goal Module — Tests

**Files:**
- Create: `tests/goal.test.js`

**Step 1: Write goal module tests**

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadGoal, renderGoalForInjection } from '../src/goal.js';

describe('goal module', () => {
  let dir;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'taste-goal-'));
    process.env.YOUR_TASTE_DIR = dir;
  });

  afterEach(async () => {
    delete process.env.YOUR_TASTE_DIR;
    await rm(dir, { recursive: true });
  });

  it('returns null when goal.md does not exist', async () => {
    const projectDir = join(dir, 'projects', 'test-project');
    await mkdir(projectDir, { recursive: true });
    const result = await loadGoal(projectDir);
    expect(result).toBeNull();
  });

  it('reads goal.md content as-is', async () => {
    const projectDir = join(dir, 'projects', 'test-project');
    await mkdir(projectDir, { recursive: true });
    const goalContent = `# Project Goal

## What
A test project for demonstrations

## Constraints
- Must be simple
- No external dependencies`;
    await writeFile(join(projectDir, 'goal.md'), goalContent, 'utf8');

    const result = await loadGoal(projectDir);
    expect(result).toBe(goalContent);
  });

  it('returns null for empty goal.md', async () => {
    const projectDir = join(dir, 'projects', 'test-project');
    await mkdir(projectDir, { recursive: true });
    await writeFile(join(projectDir, 'goal.md'), '', 'utf8');

    const result = await loadGoal(projectDir);
    expect(result).toBeNull();
  });

  it('renders goal with injection header', () => {
    const goalContent = '# Project Goal\n\n## What\nA plugin';
    const rendered = renderGoalForInjection(goalContent);
    expect(rendered).toContain('Project Goal');
    expect(rendered).toContain('A plugin');
  });

  it('renderGoalForInjection returns null for null input', () => {
    expect(renderGoalForInjection(null)).toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/sen/ai/your-taste && npx vitest run tests/goal.test.js`
Expected: FAIL — `src/goal.js` doesn't exist.

**Step 3: Commit**

```bash
cd /Users/sen/ai/your-taste
git add tests/goal.test.js
git commit -m "test: add goal module tests"
```

---

### Task 4: Goal Module — Implementation

**Files:**
- Create: `src/goal.js`

**Step 1: Implement goal.js**

Goal.md is human-authored Markdown. We read it as-is for injection — no parsing needed. This keeps the module simple and respects that the file format is Markdown first.

```javascript
import { readFile } from 'fs/promises';
import { join } from 'path';

export async function loadGoal(projectDir) {
  try {
    const content = await readFile(join(projectDir, 'goal.md'), 'utf8');
    return content.trim() || null;
  } catch {
    return null;
  }
}

export function renderGoalForInjection(goalContent) {
  if (!goalContent) return null;
  return goalContent;
}
```

**Step 2: Run tests**

Run: `cd /Users/sen/ai/your-taste && npx vitest run tests/goal.test.js`
Expected: All 5 tests PASS.

**Step 3: Commit**

```bash
cd /Users/sen/ai/your-taste
git add src/goal.js
git commit -m "feat: add goal module for reading project goal.md"
```

---

### Task 5: Refactor Context Module — Tests

**Files:**
- Rewrite: `tests/context.test.js`

The context module changes from:
- Global `context.yaml` (YAML) → Project-scoped `context.md` (Markdown)
- 15 decisions with 90-day TTL → 10 decisions FIFO (no time decay)
- focus/decisions/open_questions → decisions/open_questions/last_session (no focus — moved to global-context)

**Step 1: Rewrite context tests for Markdown format**

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  loadProjectContext,
  updateProjectContext,
  renderProjectContext,
} from '../src/context.js';

describe('project context storage (Markdown)', () => {
  let projectDir;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'taste-ctx-'));
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true });
  });

  it('returns empty context when file missing', async () => {
    const ctx = await loadProjectContext(projectDir);
    expect(ctx.decisions).toEqual([]);
    expect(ctx.open_questions).toEqual([]);
    expect(ctx.last_session).toBeNull();
  });

  it('writes and reads context as Markdown', async () => {
    await updateProjectContext(projectDir, {
      decisions: ['use Markdown for storage'],
      open_questions: ['size limits'],
      summary: 'Implemented context refactor',
    });
    const ctx = await loadProjectContext(projectDir);
    expect(ctx.decisions).toHaveLength(1);
    expect(ctx.decisions[0].text).toBe('use Markdown for storage');
    expect(ctx.open_questions).toHaveLength(1);
    expect(ctx.open_questions[0].text).toBe('size limits');
    expect(ctx.last_session).toContain('Implemented context refactor');
  });

  it('produces valid Markdown file', async () => {
    await updateProjectContext(projectDir, {
      decisions: ['decision one'],
      open_questions: ['question one'],
      summary: 'Did stuff',
    });
    const raw = await readFile(join(projectDir, 'context.md'), 'utf8');
    expect(raw).toContain('# Project Context');
    expect(raw).toContain('## Recent Decisions');
    expect(raw).toContain('- [');
    expect(raw).toContain('decision one');
    expect(raw).toContain('## Open Questions');
    expect(raw).toContain('question one');
    expect(raw).toContain('## Last Session');
    expect(raw).toContain('Did stuff');
  });

  it('deduplicates decisions by text', async () => {
    await updateProjectContext(projectDir, { decisions: ['same decision'], open_questions: [], summary: null });
    await updateProjectContext(projectDir, { decisions: ['same decision', 'new one'], open_questions: [], summary: null });
    const ctx = await loadProjectContext(projectDir);
    expect(ctx.decisions).toHaveLength(2);
    const texts = ctx.decisions.map(d => d.text);
    expect(texts.filter(t => t === 'same decision')).toHaveLength(1);
  });

  it('enforces FIFO limit of 10 decisions', async () => {
    for (let i = 0; i < 12; i++) {
      await updateProjectContext(projectDir, { decisions: [`decision ${i}`], open_questions: [], summary: null });
    }
    const ctx = await loadProjectContext(projectDir);
    expect(ctx.decisions).toHaveLength(10);
    // newest first
    expect(ctx.decisions[0].text).toBe('decision 11');
  });

  it('enforces limit of 5 open questions', async () => {
    for (let i = 0; i < 7; i++) {
      await updateProjectContext(projectDir, { decisions: [], open_questions: [`question ${i}`], summary: null });
    }
    const ctx = await loadProjectContext(projectDir);
    expect(ctx.open_questions).toHaveLength(5);
    expect(ctx.open_questions[0].text).toBe('question 6');
  });

  it('last_session is overwritten each time', async () => {
    await updateProjectContext(projectDir, { decisions: [], open_questions: [], summary: 'first session' });
    await updateProjectContext(projectDir, { decisions: [], open_questions: [], summary: 'second session' });
    const ctx = await loadProjectContext(projectDir);
    expect(ctx.last_session).toContain('second session');
    expect(ctx.last_session).not.toContain('first session');
  });

  it('parses back a manually edited context.md', async () => {
    // Simulate user editing the file directly
    const manualContent = `# Project Context

## Recent Decisions
- [2026-02-28] user added this manually
- [2026-02-27] older decision

## Open Questions
- is this working?

## Last Session
*2026-02-28* — Manual session note
`;
    await writeFile(join(projectDir, 'context.md'), manualContent, 'utf8');
    const ctx = await loadProjectContext(projectDir);
    expect(ctx.decisions).toHaveLength(2);
    expect(ctx.decisions[0].text).toBe('user added this manually');
    expect(ctx.open_questions).toHaveLength(1);
    expect(ctx.last_session).toContain('Manual session note');
  });
});

describe('project context rendering', () => {
  let projectDir;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'taste-ctx-'));
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true });
  });

  it('returns null when context is empty', async () => {
    const ctx = await loadProjectContext(projectDir);
    expect(renderProjectContext(ctx)).toBeNull();
  });

  it('renders decisions and questions for injection', async () => {
    await updateProjectContext(projectDir, {
      decisions: ['use Markdown'],
      open_questions: ['size limit?'],
      summary: 'Did work',
    });
    const ctx = await loadProjectContext(projectDir);
    const rendered = renderProjectContext(ctx);
    expect(rendered).toContain('Recent Decisions');
    expect(rendered).toContain('use Markdown');
    expect(rendered).toContain('Open Questions');
    expect(rendered).toContain('size limit?');
    expect(rendered).toContain('Last Session');
  });

  it('omits empty sections', async () => {
    await updateProjectContext(projectDir, { decisions: ['only decisions'], open_questions: [], summary: null });
    const ctx = await loadProjectContext(projectDir);
    const rendered = renderProjectContext(ctx);
    expect(rendered).toContain('Recent Decisions');
    expect(rendered).not.toContain('Open Questions');
    expect(rendered).not.toContain('Last Session');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/sen/ai/your-taste && npx vitest run tests/context.test.js`
Expected: FAIL — old API doesn't match new function names.

**Step 3: Commit**

```bash
cd /Users/sen/ai/your-taste
git add tests/context.test.js
git commit -m "test: rewrite context tests for project-scoped Markdown format"
```

---

### Task 6: Refactor Context Module — Implementation

**Files:**
- Rewrite: `src/context.js`

**Step 1: Rewrite context.js for project-scoped Markdown**

```javascript
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const MAX_DECISIONS = 10;
const MAX_QUESTIONS = 5;

function createEmptyContext() {
  return { decisions: [], open_questions: [], last_session: null };
}

function formatShortDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// --- Markdown Parsing ---

function parseContextMd(content) {
  const ctx = createEmptyContext();
  if (!content || !content.trim()) return ctx;

  const sections = content.split(/^## /m).slice(1); // split by ## headers

  for (const section of sections) {
    const [header, ...bodyLines] = section.split('\n');
    const body = bodyLines.join('\n').trim();
    const headerLower = header.trim().toLowerCase();

    if (headerLower.startsWith('recent decisions')) {
      ctx.decisions = parseListItems(body);
    } else if (headerLower.startsWith('open questions')) {
      ctx.open_questions = parseListItems(body);
    } else if (headerLower.startsWith('last session')) {
      ctx.last_session = body || null;
    }
  }

  return ctx;
}

function parseListItems(body) {
  const items = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('- ')) continue;
    const content = trimmed.slice(2).trim();

    // Try to extract date: "- [2026-02-28] text" or "- [Feb 28] text"
    const dateMatch = content.match(/^\[([^\]]+)\]\s*(.+)$/);
    if (dateMatch) {
      items.push({ date: parseDateFlexible(dateMatch[1]), text: dateMatch[2] });
    } else {
      items.push({ date: new Date().toISOString().split('T')[0], text: content });
    }
  }
  return items;
}

function parseDateFlexible(dateStr) {
  // Accept "2026-02-28" or "Feb 28" format
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  // If it looks like "Feb 28", parse with current year
  const withYear = new Date(`${dateStr}, ${new Date().getFullYear()}`);
  if (!isNaN(withYear.getTime())) return withYear.toISOString().split('T')[0];
  return new Date().toISOString().split('T')[0];
}

// --- Markdown Writing ---

function renderContextMd(ctx) {
  const lines = ['# Project Context', ''];

  if (ctx.decisions.length > 0) {
    lines.push('## Recent Decisions');
    for (const d of ctx.decisions) {
      lines.push(`- [${d.date}] ${d.text}`);
    }
    lines.push('');
  }

  if (ctx.open_questions.length > 0) {
    lines.push('## Open Questions');
    for (const q of ctx.open_questions) {
      lines.push(`- ${q.text}`);
    }
    lines.push('');
  }

  if (ctx.last_session) {
    lines.push('## Last Session');
    lines.push(ctx.last_session);
    lines.push('');
  }

  return lines.join('\n');
}

// --- Public API ---

export async function loadProjectContext(projectDir) {
  try {
    const content = await readFile(join(projectDir, 'context.md'), 'utf8');
    return parseContextMd(content);
  } catch {
    return createEmptyContext();
  }
}

export async function updateProjectContext(projectDir, sessionContext) {
  const ctx = await loadProjectContext(projectDir);
  const today = new Date().toISOString().split('T')[0];

  // Merge decisions — dedup by text, newest first, FIFO cap
  const existingTexts = new Set(ctx.decisions.map(d => d.text));
  const newDecisions = (sessionContext.decisions || [])
    .filter(t => t && !existingTexts.has(t))
    .map(t => ({ date: today, text: t }));
  ctx.decisions = [...newDecisions, ...ctx.decisions].slice(0, MAX_DECISIONS);

  // Merge open questions — dedup by text, newest first, cap
  const existingQTexts = new Set(ctx.open_questions.map(q => q.text));
  const newQuestions = (sessionContext.open_questions || [])
    .filter(t => t && !existingQTexts.has(t))
    .map(t => ({ date: today, text: t }));
  ctx.open_questions = [...newQuestions, ...ctx.open_questions].slice(0, MAX_QUESTIONS);

  // Last session — overwrite
  if (sessionContext.summary) {
    ctx.last_session = `*${today}* — ${sessionContext.summary}`;
  }

  await mkdir(projectDir, { recursive: true });
  await writeFile(join(projectDir, 'context.md'), renderContextMd(ctx), 'utf8');
  return ctx;
}

export function renderProjectContext(ctx) {
  const sections = [];

  if (ctx.decisions.length > 0) {
    const items = ctx.decisions.map(d => `- ${d.text}`).join('\n');
    sections.push(`### Recent Decisions\n${items}`);
  }

  if (ctx.open_questions.length > 0) {
    const items = ctx.open_questions.map(q => `- ${q.text}`).join('\n');
    sections.push(`### Open Questions\n${items}`);
  }

  if (ctx.last_session) {
    sections.push(`### Last Session\n${ctx.last_session}`);
  }

  if (sections.length === 0) return null;
  return `## Project Context\n\n${sections.join('\n\n')}`;
}
```

**Step 2: Run context tests**

Run: `cd /Users/sen/ai/your-taste && npx vitest run tests/context.test.js`
Expected: All 12 tests PASS.

**Step 3: Commit**

```bash
cd /Users/sen/ai/your-taste
git add src/context.js
git commit -m "feat: refactor context to project-scoped Markdown with FIFO decisions"
```

---

### Task 7: Global Context Module — Tests & Implementation

**Files:**
- Create: `tests/global-context.test.js`
- Create: `src/global-context.js`

**Step 1: Write tests**

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  loadGlobalContext,
  updateGlobalContext,
  renderGlobalContext,
} from '../src/global-context.js';

describe('global context (Markdown)', () => {
  let dir;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'taste-gc-'));
    process.env.YOUR_TASTE_DIR = dir;
  });

  afterEach(async () => {
    delete process.env.YOUR_TASTE_DIR;
    await rm(dir, { recursive: true });
  });

  it('returns empty when file missing', async () => {
    const ctx = await loadGlobalContext();
    expect(ctx.focus).toEqual([]);
  });

  it('writes and reads as Markdown', async () => {
    await updateGlobalContext(['your-taste repositioning']);
    const ctx = await loadGlobalContext();
    expect(ctx.focus).toHaveLength(1);
    expect(ctx.focus[0].text).toBe('your-taste repositioning');
  });

  it('produces valid Markdown file', async () => {
    await updateGlobalContext(['topic one']);
    const raw = await readFile(join(dir, 'global-context.md'), 'utf8');
    expect(raw).toContain('# Cross-Project Focus');
    expect(raw).toContain('- [');
    expect(raw).toContain('topic one');
  });

  it('deduplicates by text', async () => {
    await updateGlobalContext(['topic A']);
    await updateGlobalContext(['topic A', 'topic B']);
    const ctx = await loadGlobalContext();
    expect(ctx.focus).toHaveLength(2);
  });

  it('enforces max 5 entries', async () => {
    for (let i = 0; i < 7; i++) {
      await updateGlobalContext([`topic ${i}`]);
    }
    const ctx = await loadGlobalContext();
    expect(ctx.focus).toHaveLength(5);
    expect(ctx.focus[0].text).toBe('topic 6');
  });

  it('prunes entries older than 30 days', async () => {
    await updateGlobalContext(['old topic']);
    // Manually backdate
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 31);
    const content = `# Cross-Project Focus\n\n- [${oldDate.toISOString().split('T')[0]}] old topic\n`;
    await writeFile(join(dir, 'global-context.md'), content, 'utf8');

    const { pruneGlobalContext } = await import('../src/global-context.js');
    await pruneGlobalContext();
    const ctx = await loadGlobalContext();
    expect(ctx.focus).toHaveLength(0);
  });

  it('renders for injection', async () => {
    await updateGlobalContext(['project A work']);
    const ctx = await loadGlobalContext();
    const rendered = renderGlobalContext(ctx);
    expect(rendered).toContain('Cross-Project Focus');
    expect(rendered).toContain('project A work');
  });

  it('returns null when empty', async () => {
    const ctx = await loadGlobalContext();
    expect(renderGlobalContext(ctx)).toBeNull();
  });
});
```

**Step 2: Implement global-context.js**

```javascript
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const MAX_FOCUS = 5;
const FOCUS_TTL_DAYS = 30;

function getDir() {
  return process.env.YOUR_TASTE_DIR || `${process.env.HOME}/.your-taste`;
}

function getPath() {
  return join(getDir(), 'global-context.md');
}

function parseGlobalContextMd(content) {
  if (!content || !content.trim()) return { focus: [] };
  const focus = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('- ')) continue;
    const match = trimmed.slice(2).match(/^\[([^\]]+)\]\s*(.+)$/);
    if (match) {
      focus.push({ date: match[1], text: match[2] });
    }
  }
  return { focus };
}

function renderGlobalContextMd(ctx) {
  const lines = ['# Cross-Project Focus', ''];
  for (const f of ctx.focus) {
    lines.push(`- [${f.date}] ${f.text}`);
  }
  lines.push('');
  return lines.join('\n');
}

export async function loadGlobalContext() {
  try {
    const content = await readFile(getPath(), 'utf8');
    return parseGlobalContextMd(content);
  } catch {
    return { focus: [] };
  }
}

export async function updateGlobalContext(topics) {
  const ctx = await loadGlobalContext();
  const today = new Date().toISOString().split('T')[0];
  const existingTexts = new Set(ctx.focus.map(f => f.text));
  const newItems = topics
    .filter(t => t && !existingTexts.has(t))
    .map(t => ({ date: today, text: t }));
  ctx.focus = [...newItems, ...ctx.focus].slice(0, MAX_FOCUS);

  await mkdir(getDir(), { recursive: true });
  await writeFile(getPath(), renderGlobalContextMd(ctx), 'utf8');
  return ctx;
}

export async function pruneGlobalContext() {
  const ctx = await loadGlobalContext();
  const now = Date.now();
  ctx.focus = ctx.focus.filter(f => {
    const age = (now - new Date(f.date).getTime()) / (1000 * 60 * 60 * 24);
    return age <= FOCUS_TTL_DAYS;
  });
  await mkdir(getDir(), { recursive: true });
  await writeFile(getPath(), renderGlobalContextMd(ctx), 'utf8');
  return ctx;
}

export function renderGlobalContext(ctx) {
  if (ctx.focus.length === 0) return null;
  const items = ctx.focus.map(f => `- ${f.text}`).join('\n');
  return `### Cross-Project Focus\n${items}`;
}
```

**Step 3: Run tests**

Run: `cd /Users/sen/ai/your-taste && npx vitest run tests/global-context.test.js`
Expected: All 8 tests PASS.

**Step 4: Commit**

```bash
cd /Users/sen/ai/your-taste
git add src/global-context.js tests/global-context.test.js
git commit -m "feat: add global context module with Markdown storage and 30-day decay"
```

---

### Task 8: Update SessionEnd Hook — Project-Aware Writes

**Files:**
- Modify: `src/hooks/session-end.js`

**Step 1: Update session-end.js**

Replace the full file. Key changes: detect project via `process.cwd()`, write to project context.md + global-context.md. Old global `updateContext`/`pruneContext` calls replaced with project-scoped equivalents.

```javascript
#!/usr/bin/env node
import { parseTranscript, extractConversation } from '../transcript.js';
import { filterSensitiveData } from '../privacy.js';
import { readProfile, updateProfile } from '../profile.js';
import { analyzeTranscript } from '../analyzer.js';
import { readPending, updatePending, getPendingRuleTexts } from '../pending.js';
import { ensureProjectDir } from '../project.js';
import { updateProjectContext } from '../context.js';
import { updateGlobalContext, pruneGlobalContext } from '../global-context.js';

async function main() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  const { transcript_path } = JSON.parse(input);
  if (!transcript_path) process.exit(0);

  const messages = await parseTranscript(transcript_path);
  if (messages.length < 4) process.exit(0);

  const conversation = extractConversation(messages);
  if (conversation.length < 200) process.exit(0);
  const filtered = filterSensitiveData(conversation);

  const pending = await readPending();
  const pendingTexts = getPendingRuleTexts(pending);

  const { signals, rules, context } = await analyzeTranscript(filtered, pendingTexts);

  if (signals.length > 0) {
    const profile = await readProfile();
    await updateProfile(profile, signals);
  }

  if (rules.length > 0) {
    await updatePending(pending, rules);
  }

  // Write project-scoped context + global context
  if (context) {
    const projectPath = process.cwd();
    const projectDir = await ensureProjectDir(projectPath);
    await updateProjectContext(projectDir, {
      decisions: context.decisions || [],
      open_questions: context.open_questions || [],
      summary: context.topics ? context.topics.join(', ') : null,
    });

    if (context.topics && context.topics.length > 0) {
      await updateGlobalContext(context.topics);
      await pruneGlobalContext();
    }
  }
}

main().catch(() => process.exit(0));
```

**Step 2: Run full test suite**

Run: `cd /Users/sen/ai/your-taste && npx vitest run`
Expected: Most tests PASS. Some tests in `session-start.test.js` and `user-prompt.test.js` may fail because they import old `loadContext`/`renderContext` from context.js — these are fixed in Tasks 9-10.

**Step 3: Commit**

```bash
cd /Users/sen/ai/your-taste
git add src/hooks/session-end.js
git commit -m "feat: session-end writes project-scoped context.md and global-context.md"
```

---

### Task 9: Update SessionStart Hook — Inject Goal + Project Context

**Files:**
- Modify: `src/hooks/session-start.js`
- Rewrite: `tests/session-start.test.js`

**Step 1: Rewrite session-start tests**

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDefaultProfile } from '../src/profile.js';
import { buildAdditionalContext } from '../src/hooks/session-start.js';

describe('session-start output format', () => {
  it('produces template instructions when no taste.md', () => {
    const profile = createDefaultProfile();
    profile.dimensions.risk_tolerance.score = 0.8;
    profile.dimensions.risk_tolerance.confidence = 0.6;
    const result = buildAdditionalContext(profile, null, null, null);
    expect(result).toContain('rewrite');
  });

  it('uses taste.md content when available', () => {
    const profile = createDefaultProfile();
    const tasteContent = '# Your Taste\n\n- Custom rule one\n- Custom rule two\n';
    const result = buildAdditionalContext(profile, tasteContent, null, null);
    expect(result).toContain('Custom rule one');
    expect(result).toContain('error handling');
  });

  it('returns null when no instructions and no taste.md', () => {
    const profile = createDefaultProfile();
    const result = buildAdditionalContext(profile, null, null, null);
    expect(result).toBeNull();
  });

  it('includes goal content when available', () => {
    const profile = createDefaultProfile();
    profile.dimensions.risk_tolerance.score = 0.8;
    profile.dimensions.risk_tolerance.confidence = 0.6;
    const goalContent = '# Project Goal\n\n## What\nA test plugin';
    const result = buildAdditionalContext(profile, null, goalContent, null);
    expect(result).toContain('rewrite');
    expect(result).toContain('A test plugin');
  });

  it('includes project context when available', () => {
    const profile = createDefaultProfile();
    profile.dimensions.risk_tolerance.score = 0.8;
    profile.dimensions.risk_tolerance.confidence = 0.6;
    const projectCtx = { decisions: [{ date: '2026-02-28', text: 'test decision' }], open_questions: [], last_session: null };
    const { renderProjectContext } = await import('../src/context.js');
    const ctxText = renderProjectContext(projectCtx);
    const result = buildAdditionalContext(profile, null, null, ctxText);
    expect(result).toContain('rewrite');
    expect(result).toContain('test decision');
  });
});
```

**Step 2: Update session-start.js**

```javascript
#!/usr/bin/env node
import { readProfile } from '../profile.js';
import { renderInstructions } from '../instruction-renderer.js';
import { readTasteFile } from '../taste-file.js';
import { ensureProjectDir } from '../project.js';
import { loadGoal, renderGoalForInjection } from '../goal.js';
import { loadProjectContext, renderProjectContext } from '../context.js';

const QUALITY_FLOOR = 'Apply these preferences on top of professional best practices. Never compromise error handling at system boundaries, security best practices, or data integrity.';

export function buildAdditionalContext(profile, tasteContent, goalContent, projectContextText) {
  let base;
  if (tasteContent) {
    base = `${tasteContent}\n\n${QUALITY_FLOOR}`;
  } else {
    base = renderInstructions(profile);
  }

  const goalText = renderGoalForInjection(goalContent);

  const sections = [base, goalText, projectContextText].filter(Boolean);
  if (sections.length === 0) return null;
  return sections.join('\n\n');
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  const profile = await readProfile();
  const activeDims = Object.values(profile.dimensions)
    .filter(d => d.confidence > 0.3);
  const tasteContent = await readTasteFile();
  const hasTaste = !!tasteContent;

  // Load project-scoped data
  let goalContent = null;
  let projectContextText = null;
  try {
    const projectDir = await ensureProjectDir(process.cwd());
    goalContent = await loadGoal(projectDir);
    const projectCtx = await loadProjectContext(projectDir);
    projectContextText = renderProjectContext(projectCtx);
  } catch {
    // No project data yet — that's fine
  }

  const hasGoal = !!goalContent;
  const hasProjectCtx = !!projectContextText;

  if (activeDims.length === 0 && !hasTaste && !hasGoal && !hasProjectCtx) {
    process.exit(0);
  }

  const additionalContext = buildAdditionalContext(profile, tasteContent, goalContent, projectContextText);

  const source = hasTaste ? 'taste.md' : 'templates';
  const output = {
    result: `your-taste: ${activeDims.length} dimensions, source: ${source}`,
  };

  if (additionalContext) {
    output.hookSpecificOutput = { additionalContext };
  }

  console.log(JSON.stringify(output));
}

main().catch(() => process.exit(0));
```

**Step 3: Run tests**

Run: `cd /Users/sen/ai/your-taste && npx vitest run tests/session-start.test.js`
Expected: All tests PASS.

**Step 4: Commit**

```bash
cd /Users/sen/ai/your-taste
git add src/hooks/session-start.js tests/session-start.test.js
git commit -m "feat: session-start injects goal.md and project context"
```

---

### Task 10: Update UserPromptSubmit Hook — Priority-Based Injection

**Files:**
- Modify: `src/hooks/user-prompt.js`
- Rewrite: `tests/user-prompt.test.js`

**Step 1: Rewrite user-prompt tests**

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { buildUserPromptContext } from '../src/hooks/user-prompt.js';
import { ensureProjectDir } from '../src/project.js';

describe('user-prompt hook priority-based injection', () => {
  let dir;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'taste-up-'));
    process.env.YOUR_TASTE_DIR = dir;
  });

  afterEach(async () => {
    delete process.env.YOUR_TASTE_DIR;
    await rm(dir, { recursive: true });
  });

  it('returns framework when no other data exists', async () => {
    const result = await buildUserPromptContext(dir);
    expect(result).toContain('Intent Inference');
  });

  it('includes goal content when available', async () => {
    const projectDir = await ensureProjectDir('/test/project');
    await writeFile(join(projectDir, 'goal.md'), '# Project Goal\n\n## What\nTest plugin', 'utf8');

    const result = await buildUserPromptContext(projectDir);
    expect(result).toContain('Intent Inference');
    expect(result).toContain('Test plugin');
  });

  it('includes project context when available', async () => {
    const projectDir = await ensureProjectDir('/test/project');
    await writeFile(join(projectDir, 'context.md'), '# Project Context\n\n## Recent Decisions\n- [2026-02-28] test decision\n', 'utf8');

    const result = await buildUserPromptContext(projectDir);
    expect(result).toContain('Intent Inference');
    expect(result).toContain('test decision');
  });

  it('includes global context when available', async () => {
    await writeFile(join(dir, 'global-context.md'), '# Cross-Project Focus\n\n- [2026-02-28] cross-project topic\n', 'utf8');
    const projectDir = join(dir, 'projects', 'test');
    await mkdir(projectDir, { recursive: true });

    const result = await buildUserPromptContext(projectDir);
    expect(result).toContain('cross-project topic');
  });

  it('drops lower-priority content when exceeding max chars', async () => {
    const projectDir = await ensureProjectDir('/test/project');
    // Create a very large goal.md and context to trigger truncation
    const largeGoal = '# Goal\n\n' + 'x'.repeat(3000);
    await writeFile(join(projectDir, 'goal.md'), largeGoal, 'utf8');
    const largeContext = '# Context\n\n## Recent Decisions\n' + Array.from({ length: 20 }, (_, i) => `- [2026-02-28] ${'y'.repeat(200)} ${i}`).join('\n');
    await writeFile(join(projectDir, 'context.md'), largeContext, 'utf8');

    const result = await buildUserPromptContext(projectDir);
    // Framework (P2) should always be present
    expect(result).toContain('Intent Inference');
    // Total should be within budget
    expect(result.length).toBeLessThanOrEqual(5000); // reasonable upper bound
  });
});
```

**Step 2: Update user-prompt.js**

```javascript
#!/usr/bin/env node
import { readFile } from 'fs/promises';
import { loadGoal, renderGoalForInjection } from '../goal.js';
import { loadProjectContext, renderProjectContext } from '../context.js';
import { loadGlobalContext, renderGlobalContext } from '../global-context.js';
import { ensureProjectDir } from '../project.js';

const MAX_CHARS = 4000;

export async function buildUserPromptContext(projectDir) {
  // P2: Thinking framework (always included)
  let framework = '';
  try {
    framework = await readFile(
      new URL('../../prompts/thinking-framework.md', import.meta.url),
      'utf8',
    );
  } catch {
    // Template missing — degrade gracefully
  }

  // P1: Project goal
  let goalText = null;
  try {
    const goalContent = await loadGoal(projectDir);
    goalText = renderGoalForInjection(goalContent);
  } catch { /* no goal yet */ }

  // P3: Project context
  let projectCtxText = null;
  try {
    const projectCtx = await loadProjectContext(projectDir);
    projectCtxText = renderProjectContext(projectCtx);
  } catch { /* no context yet */ }

  // P4: Global context
  let globalCtxText = null;
  try {
    const globalCtx = await loadGlobalContext();
    globalCtxText = renderGlobalContext(globalCtx);
  } catch { /* no global context */ }

  // Priority-based assembly: P2 > P1 > P3 > P4
  // P0 (taste.md) is injected by session-start, not here
  const prioritized = [
    { text: framework, priority: 'P2', required: true },
    { text: goalText, priority: 'P1', required: true },
    { text: projectCtxText, priority: 'P3', required: false },
    { text: globalCtxText, priority: 'P4', required: false },
  ].filter(s => s.text);

  if (prioritized.length === 0) return null;

  // Add sections until budget exceeded, then stop
  const sections = [];
  let totalLen = 0;

  for (const s of prioritized) {
    if (totalLen + s.text.length > MAX_CHARS && !s.required) break;
    sections.push(s.text);
    totalLen += s.text.length;
  }

  return sections.join('\n\n') || null;
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  let projectDir;
  try {
    projectDir = await ensureProjectDir(process.cwd());
  } catch {
    projectDir = null;
  }

  const additionalContext = await buildUserPromptContext(projectDir);
  if (!additionalContext) process.exit(0);

  console.log(JSON.stringify({
    hookSpecificOutput: { additionalContext },
  }));
}

main().catch(() => process.exit(0));
```

**Step 3: Run tests**

Run: `cd /Users/sen/ai/your-taste && npx vitest run tests/user-prompt.test.js`
Expected: All 5 tests PASS.

**Step 4: Commit**

```bash
cd /Users/sen/ai/your-taste
git add src/hooks/user-prompt.js tests/user-prompt.test.js
git commit -m "feat: user-prompt hook with priority-based injection of goal, context, global-context"
```

---

### Task 11: Update Thinking Framework — State Understanding Before Proposing

**Files:**
- Modify: `prompts/thinking-framework.md`

**Step 1: Add step 4 to Intent Inference section**

After line 8 (`4. From A, what implications...`), insert the new step and renumber:

```markdown
## How to Think About This User's Messages

### Intent Inference
When the user sends a message:
1. What did they literally say? (C)
2. What might they actually mean? (A) — trace back through their reasoning chain
3. Why are they raising this NOW? — timing reveals priority
4. Briefly state your understanding of the user's underlying concern before proposing solutions — this confirms alignment and builds trust
5. From A, what implications should you consider that weren't explicitly stated?

### Solution Quality
Before proposing a solution:
1. What broader problem is this a symptom of?
2. Are there fundamentally different approaches worth considering?
3. Which approach best fits the user's current strategic direction?
4. What second-order problems does your proposed approach create?

### Learning from Corrections
When the user corrects you:
- Capture the underlying principle, not just the fix
- The correction pattern reveals thinking style — persist important insights

### Context Awareness
- After significant corrections or decisions, proactively persist insights
  to durable files before they're lost to compression
- When context feels insufficient, say so and ask for what you need
```

**Step 2: Run full suite to verify nothing breaks**

Run: `cd /Users/sen/ai/your-taste && npx vitest run`
Expected: All tests PASS.

**Step 3: Commit**

```bash
cd /Users/sen/ai/your-taste
git add prompts/thinking-framework.md
git commit -m "feat: add understanding-before-proposing step to thinking framework"
```

---

### Task 12: Clean Up Old Context.yaml References & Full Integration Test

**Files:**
- Delete old `context.yaml` from `~/.your-taste/` if it exists (manual, not automated)
- Verify: all tests pass

**Step 1: Search for any remaining context.yaml references in code**

Run: `cd /Users/sen/ai/your-taste && grep -r "context.yaml" src/ tests/ --include="*.js"`
Expected: No matches. If any found, update them.

**Step 2: Run full test suite**

Run: `cd /Users/sen/ai/your-taste && npx vitest run`
Expected: All tests PASS (old context tests replaced, new project/goal/global-context tests added).

**Step 3: Manually test hook output**

Test UserPromptSubmit:
```bash
cd /Users/sen/ai/your-taste && echo '{}' | node src/hooks/user-prompt.js
```
Expected: JSON with `hookSpecificOutput.additionalContext` containing thinking framework text.

Test SessionStart:
```bash
cd /Users/sen/ai/your-taste && echo '{}' | node src/hooks/session-start.js
```
Expected: JSON output with additionalContext.

**Step 4: Final commit**

```bash
cd /Users/sen/ai/your-taste
git add -A
git commit -m "chore: clean up old context.yaml references, all tests passing"
```

---

## Deferred to Future Tasks

These are explicitly NOT in scope for this plan:

| Item | Reason | When |
|------|--------|------|
| `taste init` goal.md generation | Needs Haiku prompt design for goal extraction | Phase 1.5 — after validating goal.md format with manual files |
| Decision promotion (context → goal review) | Needs accumulation data first | Phase 3 |
| `taste goal edit` command | Nice-to-have, users can edit goal.md directly | Phase 3 |
| A→C few-shot examples | Need real Haiku output data | Phase 4 |
| Personalized thinking framework | Static template may suffice | Phase 4 |
