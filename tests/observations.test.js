import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFile, mkdir, writeFile, rm } from 'fs/promises';
import {
  readObservations,
  writeObservations,
  extractSection,
  extractSuggestedRules,
  removeSuggestedRules,
  extractThinkingPatterns,
  extractReasoningCheckpoints,
} from '../src/observations.js';

const TEST_DIR = '/tmp/your-taste-test-observations';

describe('observations', () => {
  beforeEach(async () => {
    process.env.YOUR_TASTE_DIR = TEST_DIR;
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    delete process.env.YOUR_TASTE_DIR;
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it('returns null for missing file', async () => {
    expect(await readObservations()).toBeNull();
  });

  it('reads existing observations.md', async () => {
    await writeFile(`${TEST_DIR}/observations.md`, '## Thinking Patterns\n\n- **Pattern A**: desc');
    const content = await readObservations();
    expect(content).toContain('Pattern A');
  });

  it('writes observations.md', async () => {
    const content = '## Thinking Patterns\n\n- **Test**: content';
    await writeObservations(content);
    const saved = await readFile(`${TEST_DIR}/observations.md`, 'utf8');
    expect(saved).toBe(content);
  });

  it('creates directory if missing', async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
    process.env.YOUR_TASTE_DIR = `${TEST_DIR}/nested/dir`;
    await writeObservations('content');
    const saved = await readFile(`${TEST_DIR}/nested/dir/observations.md`, 'utf8');
    expect(saved).toBe('content');
  });

  it('extracts a named section', () => {
    const md = `## Thinking Patterns

- **A**: first

## Behavioral Patterns

- **B**: second

## Suggested Rules

- Rule 1`;

    expect(extractSection(md, 'Thinking Patterns')).toContain('**A**');
    expect(extractSection(md, 'Thinking Patterns')).not.toContain('**B**');
    expect(extractSection(md, 'Behavioral Patterns')).toContain('**B**');
    expect(extractSection(md, 'Suggested Rules')).toContain('Rule 1');
  });

  it('extracts section with localized headers', () => {
    const md = `## 思维模式

- **Exec simulation**: desc

## 行为模式

- **Clean break**: desc`;

    expect(extractSection(md, '思维模式')).toContain('Exec simulation');
    expect(extractSection(md, '行为模式')).toContain('Clean break');
  });

  it('returns null for missing section', () => {
    const md = '## Thinking Patterns\n\n- content';
    expect(extractSection(md, 'Nonexistent')).toBeNull();
  });

  it('extracts suggested rules as array', () => {
    const md = `## Suggested Rules

- "Act independently after plan confirmation"
- "Trace full usage path for parameters"`;

    const rules = extractSuggestedRules(md);
    expect(rules).toEqual([
      'Act independently after plan confirmation',
      'Trace full usage path for parameters',
    ]);
  });

  it('returns empty array when no suggested rules', () => {
    const md = '## Thinking Patterns\n\n- content';
    expect(extractSuggestedRules(md)).toEqual([]);
  });

  it('removes specified suggested rules', () => {
    const md = `## Thinking Patterns

- **A**: desc

## Suggested Rules

- "Rule to keep"
- "Rule to remove"
- "Another keeper"`;

    const result = removeSuggestedRules(md, ['Rule to remove']);
    expect(result).toContain('Rule to keep');
    expect(result).toContain('Another keeper');
    expect(result).not.toContain('Rule to remove');
    expect(result).toContain('Thinking Patterns');
  });
});

describe('extractReasoningCheckpoints', () => {
  it('extracts English "Reasoning Checkpoints" section', () => {
    const md = '## Reasoning Checkpoints\n\nCheckpoint 1\nCheckpoint 2\n\n## Domain Reasoning\n\nSomething';
    expect(extractReasoningCheckpoints(md)).toBe('Checkpoint 1\nCheckpoint 2');
  });

  it('extracts Chinese "推理检查点" section', () => {
    const md = '## 推理检查点\n\nCheckpoint one\n\n## 领域推理\n\nSomething';
    expect(extractReasoningCheckpoints(md)).toBe('Checkpoint one');
  });

  it('falls back to legacy "Thinking Patterns" header', () => {
    const md = '## Thinking Patterns\n\nPattern 1\n\n## Other\n\nSomething';
    expect(extractReasoningCheckpoints(md)).toBe('Pattern 1');
  });

  it('falls back to legacy "思维模式" header', () => {
    const md = '## 思维模式\n\nPattern one\n\n## Other\n\nSomething';
    expect(extractReasoningCheckpoints(md)).toBe('Pattern one');
  });

  it('returns null when no matching section', () => {
    expect(extractReasoningCheckpoints('## Other\n\nContent')).toBeNull();
  });

  it('returns null when markdown is null', () => {
    expect(extractReasoningCheckpoints(null)).toBeNull();
  });
});

describe('extractThinkingPatterns (deprecated)', () => {
  it('extracts English thinking patterns section', () => {
    const md = '## Thinking Patterns\n\nPattern 1\nPattern 2\n\n## Working Principles\n\nSomething';
    expect(extractThinkingPatterns(md)).toBe('Pattern 1\nPattern 2');
  });

  it('extracts Chinese header', () => {
    const md = '## 思维模式\n\nPattern one\n\n## 工作原则\n\nSomething';
    expect(extractThinkingPatterns(md)).toBe('Pattern one');
  });

  it('returns null when no thinking patterns section', () => {
    expect(extractThinkingPatterns('## Other\n\nContent')).toBeNull();
  });

  it('returns null when markdown is null', () => {
    expect(extractThinkingPatterns(null)).toBeNull();
  });
});
