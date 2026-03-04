import { describe, it, expect } from 'vitest';
import { renderFromObservations } from '../src/instruction-renderer.js';

describe('renderFromObservations', () => {
  it('renders working principles and common misreads, excludes thinking patterns', () => {
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

  it('works with Chinese headers', () => {
    const md = `## 思维模式

- **执行模拟**: 通过心理运行代码验证。(6 sessions)

## 行为模式

- **迁移策略** (5 sessions)

## 建议规则

- "独立执行"`;

    const result = renderFromObservations(md);
    expect(result).not.toContain('执行模拟');
    expect(result).toContain('迁移策略');
    expect(result).not.toContain('独立执行');
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
});
