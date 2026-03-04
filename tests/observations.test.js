import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFile, mkdir, writeFile, rm } from 'fs/promises';
import {
  readObservations,
  writeObservations,
  extractSection,
  extractSuggestedRules,
  removeSuggestedRules,
  extractThinkingPatterns,
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

- **执行模拟**: desc

## 行为模式

- **干净切换**: desc`;

    expect(extractSection(md, '思维模式')).toContain('执行模拟');
    expect(extractSection(md, '行为模式')).toContain('干净切换');
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

describe('extractThinkingPatterns', () => {
  it('extracts English thinking patterns section', () => {
    const md = '## Thinking Patterns\n\nPattern 1\nPattern 2\n\n## Working Principles\n\nSomething';
    expect(extractThinkingPatterns(md)).toBe('Pattern 1\nPattern 2');
  });

  it('extracts Chinese header', () => {
    const md = '## 思维模式\n\n模式一\n\n## 工作原则\n\nSomething';
    expect(extractThinkingPatterns(md)).toBe('模式一');
  });

  it('returns null when no thinking patterns section', () => {
    expect(extractThinkingPatterns('## Other\n\nContent')).toBeNull();
  });

  it('returns null when markdown is null', () => {
    expect(extractThinkingPatterns(null)).toBeNull();
  });
});
