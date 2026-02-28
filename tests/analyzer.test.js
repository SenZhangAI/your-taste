import { describe, it, expect } from 'vitest';
import { parseAnalysisResponse } from '../src/analyzer.js';

describe('analyzer response parsing', () => {
  it('parses signals and candidate_rules from response', () => {
    const json = JSON.stringify({
      signals: [
        { dimension: 'risk_tolerance', score: 0.8, direction: 'bold', evidence: 'test', summary: 'test' }
      ],
      candidate_rules: ['Clean breaks over gradual migration'],
      session_quality: 'high',
    });
    const result = parseAnalysisResponse(json);
    expect(result.signals).toHaveLength(1);
    expect(result.rules).toEqual(['Clean breaks over gradual migration']);
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

  it('filters non-string rules', () => {
    const json = JSON.stringify({
      signals: [],
      candidate_rules: ['Valid rule', 123, null, '', 'Another valid'],
      session_quality: 'medium',
    });
    const result = parseAnalysisResponse(json);
    expect(result.rules).toEqual(['Valid rule', 'Another valid']);
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
});
