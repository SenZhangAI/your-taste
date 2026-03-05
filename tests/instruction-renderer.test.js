import { describe, it, expect } from 'vitest';
import { renderFromObservations } from '../src/instruction-renderer.js';

describe('renderFromObservations', () => {
  it('renders new framework sections: domain reasoning and failure patterns', () => {
    const md = `## Reasoning Checkpoints\n\n- **Verify FK**: check join keys\n\n## Domain Reasoning\n\n- **DB joins** (3 sessions)\n\n## Failure Patterns\n\n- **AI pattern**: accepts hypothesis as fact`;

    const result = renderFromObservations(md);
    expect(result).not.toContain('Verify FK'); // checkpoints excluded
    expect(result).toContain('DB joins');
    expect(result).toContain('accepts hypothesis as fact');
  });

  it('renders legacy sections: behavioral patterns and common misreads, excludes thinking patterns', () => {
    const md = `## Thinking Patterns

- **Execution simulation**: validates by running code mentally. (6 sessions, high confidence)

## Behavioral Patterns

- **Migration strategy** (5 sessions)
  Motivation: minimize total risk
  Evidence: chose clean break for new projects

## Suggested Rules

- "Act independently"`;

    const result = renderFromObservations(md);
    expect(result).not.toContain('Execution simulation');
    expect(result).toContain('Migration strategy');
    expect(result).not.toContain('Act independently');
  });

  it('works with legacy Chinese headers', () => {
    const md = `## 思维模式

- **Exec simulation**: validates by running code mentally. (6 sessions)

## 行为模式

- **Migration strategy** (5 sessions)

## 建议规则

- "Act independently"`;

    const result = renderFromObservations(md);
    expect(result).not.toContain('Exec simulation');
    expect(result).toContain('Migration strategy');
    expect(result).not.toContain('Act independently');
  });

  it('returns null when observations is null', () => {
    expect(renderFromObservations(null)).toBeNull();
  });

  it('returns null when observations has no renderable sections', () => {
    expect(renderFromObservations('## Suggested Rules\n\n- "rule"')).toBeNull();
    expect(renderFromObservations('## Thinking Patterns\n\n- **Test**: content')).toBeNull();
  });

  it('renders with only behavioral patterns', () => {
    const md = '## Behavioral Patterns\n\n- **Test**: content';
    const result = renderFromObservations(md);
    expect(result).toContain('Test');
  });

  it('renders with only common misreads', () => {
    const md = '## Common Misreads\n\n- Misread one';
    const result = renderFromObservations(md);
    expect(result).toContain('Misread one');
  });

  it('renders new-style Chinese headers', () => {
    const md = `## 推理检查点\n\n- **Verify FK**: check join keys\n\n## 领域推理\n\n- **DB joins** (3 sessions)\n\n## 失败模式\n\n- **AI pattern**: accepts hypothesis as fact`;

    const result = renderFromObservations(md);
    expect(result).not.toContain('Verify FK'); // checkpoints excluded
    expect(result).toContain('DB joins');
    expect(result).toContain('accepts hypothesis as fact');
  });
});
