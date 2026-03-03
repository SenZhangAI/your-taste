import { describe, it, expect } from 'vitest';
import { parseAnalysisResponse, parseExtractResponse, parseSynthesisResponse } from '../src/analyzer.js';

describe('analyzer response parsing', () => {
  it('parses signals and candidate_rules from response', () => {
    const json = JSON.stringify({
      signals: [
        { dimension: 'risk_tolerance', score: 0.8, direction: 'bold', evidence: 'test', summary: 'test' }
      ],
      candidate_rules: [
        { text: 'Clean breaks over gradual migration', evidence: 'Chose rewrite over incremental refactoring' }
      ],
      session_quality: 'high',
    });
    const result = parseAnalysisResponse(json);
    expect(result.signals).toHaveLength(1);
    expect(result.rules).toEqual([
      { text: 'Clean breaks over gradual migration', evidence: 'Chose rewrite over incremental refactoring' }
    ]);
  });

  it('returns empty rules when candidate_rules is missing', () => {
    const json = JSON.stringify({
      signals: [
        { dimension: 'risk_tolerance', score: 0.8, direction: 'bold', evidence: 'test', summary: 'test' }
      ],
      session_quality: 'medium',
    });
    const result = parseAnalysisResponse(json);
    expect(result.signals).toHaveLength(1);
    expect(result.rules).toEqual([]);
  });

  it('returns empty signals and rules for session_quality none', () => {
    const json = JSON.stringify({ signals: [], candidate_rules: [], session_quality: 'none' });
    const result = parseAnalysisResponse(json);
    expect(result.signals).toEqual([]);
    expect(result.rules).toEqual([]);
    expect(result.context).toBeNull();
  });

  it('handles malformed JSON gracefully', () => {
    const result = parseAnalysisResponse('not json at all');
    expect(result.signals).toEqual([]);
    expect(result.rules).toEqual([]);
  });

  it('filters invalid signals', () => {
    const json = JSON.stringify({
      signals: [
        { dimension: 'risk_tolerance', score: 0.8, direction: 'bold', evidence: 'test', summary: 'test' },
        { dimension: 'nonexistent', score: 0.5, direction: 'x', evidence: 'x', summary: 'x' },
        { dimension: 'risk_tolerance', evidence: 'no score' },
      ],
      candidate_rules: [],
      session_quality: 'medium',
    });
    const result = parseAnalysisResponse(json);
    expect(result.signals).toHaveLength(1);
  });

  it('parses legacy string rules for backward compatibility', () => {
    const json = JSON.stringify({
      signals: [],
      candidate_rules: ['Valid rule', 'Another valid'],
      session_quality: 'medium',
    });
    const result = parseAnalysisResponse(json);
    expect(result.rules).toEqual([
      { text: 'Valid rule', evidence: null },
      { text: 'Another valid', evidence: null },
    ]);
  });

  it('filters invalid rules', () => {
    const json = JSON.stringify({
      signals: [],
      candidate_rules: [
        { text: 'Valid', evidence: 'some evidence' },
        123,
        null,
        { text: '', evidence: 'empty text' },
        { noText: true },
        'Legacy string',
      ],
      session_quality: 'medium',
    });
    const result = parseAnalysisResponse(json);
    expect(result.rules).toHaveLength(2);
    expect(result.rules[0]).toEqual({ text: 'Valid', evidence: 'some evidence' });
    expect(result.rules[1]).toEqual({ text: 'Legacy string', evidence: null });
  });

  it('parses session_context when present', () => {
    const json = JSON.stringify({
      signals: [],
      candidate_rules: [],
      session_quality: 'medium',
      session_context: {
        topics: ['product repositioning'],
        decisions: ['use YAML storage'],
        open_questions: ['size limits'],
      },
    });
    const result = parseAnalysisResponse(json);
    expect(result.context).toEqual({
      topics: ['product repositioning'],
      decisions: ['use YAML storage'],
      open_questions: ['size limits'],
    });
  });

  it('returns null context when session_context is missing', () => {
    const json = JSON.stringify({
      signals: [],
      candidate_rules: [],
      session_quality: 'medium',
    });
    const result = parseAnalysisResponse(json);
    expect(result.context).toBeNull();
  });

  it('preserves context even when session_quality is none', () => {
    const json = JSON.stringify({
      signals: [],
      candidate_rules: [],
      session_quality: 'none',
      session_context: {
        topics: ['debugging API integration'],
        decisions: ['use retry with exponential backoff'],
        open_questions: [],
      },
    });
    const result = parseAnalysisResponse(json);
    expect(result.signals).toEqual([]);
    expect(result.rules).toEqual([]);
    expect(result.context).toEqual({
      topics: ['debugging API integration'],
      decisions: ['use retry with exponential backoff'],
      open_questions: [],
    });
  });

  it('validates context structure — filters non-string array items', () => {
    const json = JSON.stringify({
      signals: [],
      candidate_rules: [],
      session_quality: 'medium',
      session_context: {
        topics: ['valid topic', 123, null, ''],
        decisions: ['valid decision', false],
        open_questions: ['valid question'],
      },
    });
    const result = parseAnalysisResponse(json);
    expect(result.context.topics).toEqual(['valid topic']);
    expect(result.context.decisions).toEqual(['valid decision']);
    expect(result.context.open_questions).toEqual(['valid question']);
  });

  it('returns null context when session_context has no valid entries', () => {
    const json = JSON.stringify({
      signals: [],
      candidate_rules: [],
      session_quality: 'medium',
      session_context: {
        topics: [],
        decisions: [],
        open_questions: [],
      },
    });
    const result = parseAnalysisResponse(json);
    expect(result.context).toBeNull();
  });

  it('handles non-object session_context gracefully', () => {
    const json = JSON.stringify({
      signals: [],
      candidate_rules: [],
      session_quality: 'medium',
      session_context: 'not an object',
    });
    const result = parseAnalysisResponse(json);
    expect(result.context).toBeNull();
  });
});

describe('Pass 1: parseExtractResponse', () => {
  it('parses decision points with all fields', () => {
    const json = JSON.stringify({
      decision_points: [
        {
          ai_proposed: 'Listed 3 options',
          user_reacted: 'Just pick one',
          strength: 'correction',
          dimension: 'communication_style',
          principle: 'Recommend one approach, not menus',
        },
      ],
      session_context: { topics: ['auth redesign'], decisions: [], open_questions: [] },
      session_quality: 'high',
    });
    const result = parseExtractResponse(json);
    expect(result.decisionPoints).toHaveLength(1);
    expect(result.decisionPoints[0].strength).toBe('correction');
    expect(result.decisionPoints[0].dimension).toBe('communication_style');
    expect(result.context.topics).toEqual(['auth redesign']);
  });

  it('returns empty for malformed JSON', () => {
    const result = parseExtractResponse('not json');
    expect(result.decisionPoints).toEqual([]);
    expect(result.context).toBeNull();
  });

  it('filters decision points missing required fields', () => {
    const json = JSON.stringify({
      decision_points: [
        { ai_proposed: 'good', user_reacted: 'good', strength: 'correction', dimension: 'risk_tolerance', principle: 'valid' },
        { ai_proposed: 'missing principle', user_reacted: 'test', strength: 'correction', dimension: 'risk_tolerance' },
        { ai_proposed: 'empty principle', user_reacted: 'test', strength: 'correction', dimension: 'risk_tolerance', principle: '' },
        null,
        123,
      ],
      session_quality: 'medium',
    });
    const result = parseExtractResponse(json);
    expect(result.decisionPoints).toHaveLength(1);
  });

  it('defaults invalid strength to correction', () => {
    const json = JSON.stringify({
      decision_points: [
        { ai_proposed: 'a', user_reacted: 'b', strength: 'unknown_type', dimension: 'risk_tolerance', principle: 'test' },
      ],
    });
    const result = parseExtractResponse(json);
    expect(result.decisionPoints[0].strength).toBe('correction');
  });

  it('nulls invalid dimension', () => {
    const json = JSON.stringify({
      decision_points: [
        { ai_proposed: 'a', user_reacted: 'b', strength: 'correction', dimension: 'nonexistent', principle: 'test' },
      ],
    });
    const result = parseExtractResponse(json);
    expect(result.decisionPoints[0].dimension).toBeNull();
  });

  it('preserves optional conditions field', () => {
    const json = JSON.stringify({
      decision_points: [
        {
          ai_proposed: 'Proposed full schema replacement',
          user_reacted: 'Depends on context — new project yes, production no',
          strength: 'correction',
          dimension: 'risk_tolerance',
          principle: 'Minimize total migration risk',
          conditions: 'New project → clean break; production system → gradual migration',
        },
      ],
      session_quality: 'high',
    });
    const result = parseExtractResponse(json);
    expect(result.decisionPoints[0].conditions).toBe('New project → clean break; production system → gradual migration');
  });

  it('defaults conditions to null when absent', () => {
    const json = JSON.stringify({
      decision_points: [
        {
          ai_proposed: 'Listed 3 options',
          user_reacted: 'Just pick one',
          strength: 'correction',
          dimension: 'communication_style',
          principle: 'Recommend one approach',
        },
      ],
      session_quality: 'high',
    });
    const result = parseExtractResponse(json);
    expect(result.decisionPoints[0].conditions).toBeNull();
  });
});

describe('Pass 2: parseSynthesisResponse', () => {
  it('returns markdown string as-is', () => {
    const markdown = `## Thinking Patterns

- **A→B→C inference**: traces root cause. (5 sessions, high confidence)

## Behavioral Patterns

- **Migration strategy** (3 sessions)
  Motivation: minimize risk
  Evidence: chose clean break for new schema

## Suggested Rules

- "Act independently after plan confirmation"`;

    const result = parseSynthesisResponse(markdown);
    expect(result).toBe(markdown);
  });

  it('strips markdown code fences if LLM wraps output', () => {
    const inner = '## Thinking Patterns\n\n- **Test**: content';
    const wrapped = '```markdown\n' + inner + '\n```';
    const result = parseSynthesisResponse(wrapped);
    expect(result).toBe(inner);
  });

  it('strips plain code fences', () => {
    const inner = '## Thinking Patterns\n\n- **Test**: content';
    const wrapped = '```\n' + inner + '\n```';
    const result = parseSynthesisResponse(wrapped);
    expect(result).toBe(inner);
  });

  it('returns empty string for empty response', () => {
    expect(parseSynthesisResponse('')).toBe('');
    expect(parseSynthesisResponse('   ')).toBe('');
  });
});
