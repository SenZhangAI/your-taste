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

  it('returns empty for session_quality none', () => {
    const json = JSON.stringify({ signals: [], candidate_rules: [], session_quality: 'none' });
    const result = parseAnalysisResponse(json);
    expect(result.signals).toEqual([]);
    expect(result.rules).toEqual([]);
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
});
