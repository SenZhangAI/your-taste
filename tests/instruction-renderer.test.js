import { describe, it, expect } from 'vitest';
import { renderFromObservations, renderInstructions } from '../src/instruction-renderer.js';
import { createDefaultProfile } from '../src/profile.js';

describe('renderFromObservations', () => {
  it('renders thinking patterns and behavioral patterns', () => {
    const md = `## Thinking Patterns

- **Execution simulation**: validates by running code mentally. (6 sessions, high confidence)

## Behavioral Patterns

- **Migration strategy** (5 sessions)
  Motivation: minimize total risk
  Evidence: chose clean break for new projects

## Suggested Rules

- "Act independently"`;

    const result = renderFromObservations(md);
    expect(result).toContain('Execution simulation');
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
    expect(result).toContain('执行模拟');
    expect(result).toContain('迁移策略');
    expect(result).not.toContain('独立执行');
  });

  it('returns null when observations is null', () => {
    expect(renderFromObservations(null)).toBeNull();
  });

  it('returns null when observations has no patterns', () => {
    expect(renderFromObservations('## Suggested Rules\n\n- "rule"')).toBeNull();
  });

  it('renders with only thinking patterns', () => {
    const md = '## Thinking Patterns\n\n- **Test**: content';
    const result = renderFromObservations(md);
    expect(result).toContain('Test');
  });

  it('renders with only behavioral patterns', () => {
    const md = '## Behavioral Patterns\n\n- **Test**: content';
    const result = renderFromObservations(md);
    expect(result).toContain('Test');
  });
});

describe('renderInstructions fallback', () => {
  it('returns null for default profile', () => {
    const profile = createDefaultProfile();
    expect(renderInstructions(profile)).toBeNull();
  });

  it('renders instruction for high-confidence dimension', () => {
    const profile = createDefaultProfile();
    profile.dimensions.risk_tolerance.score = 0.8;
    profile.dimensions.risk_tolerance.confidence = 0.6;
    const result = renderInstructions(profile);
    expect(result).toContain('rewrite');
  });
});
