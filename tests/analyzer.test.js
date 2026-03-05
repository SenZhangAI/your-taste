import { describe, it, expect } from 'vitest';
import { parseExtractResponse, parseSynthesisResponse } from '../src/analyzer.js';

describe('Pass 1: parseExtractResponse', () => {
  it('parses reasoning gaps with all fields', () => {
    const json = JSON.stringify({
      reasoning_gaps: [
        {
          what_ai_did: 'Accepted user hypothesis without verifying in code',
          what_broke: 'Hypothesis was wrong, led to incorrect implementation',
          missing_step: 'Read the actual code path before implementing',
          checkpoint: 'Verify data relationships in code before acting on assumptions',
          strength: 'correction',
          category: 'verification_skip',
        },
      ],
      session_context: { topics: ['risk scoring redesign'], decisions: [], open_questions: [] },
      session_quality: 'high',
      user_language: 'zh',
    });
    const result = parseExtractResponse(json);
    expect(result.reasoningGaps).toHaveLength(1);
    expect(result.reasoningGaps[0].what_ai_did).toBe('Accepted user hypothesis without verifying in code');
    expect(result.reasoningGaps[0].what_broke).toBe('Hypothesis was wrong, led to incorrect implementation');
    expect(result.reasoningGaps[0].missing_step).toBe('Read the actual code path before implementing');
    expect(result.reasoningGaps[0].checkpoint).toBe('Verify data relationships in code before acting on assumptions');
    expect(result.reasoningGaps[0].strength).toBe('correction');
    expect(result.reasoningGaps[0].category).toBe('verification_skip');
    expect(result.context.topics).toEqual(['risk scoring redesign']);
    expect(result.userLanguage).toBe('zh');
  });

  it('returns empty for malformed JSON', () => {
    const result = parseExtractResponse('not json');
    expect(result.reasoningGaps).toEqual([]);
    expect(result.context).toBeNull();
    expect(result.userLanguage).toBeNull();
  });

  it('filters gaps missing required fields', () => {
    const json = JSON.stringify({
      reasoning_gaps: [
        { what_ai_did: 'good', what_broke: 'good', checkpoint: 'valid', strength: 'correction', category: 'breadth_miss' },
        { what_ai_did: 'missing what_broke', checkpoint: 'valid', strength: 'correction', category: 'breadth_miss' },
        { what_ai_did: 'empty checkpoint', what_broke: 'broke', checkpoint: '', strength: 'correction', category: 'breadth_miss' },
        null,
        123,
      ],
      session_quality: 'medium',
    });
    const result = parseExtractResponse(json);
    expect(result.reasoningGaps).toHaveLength(1);
    expect(result.reasoningGaps[0].what_ai_did).toBe('good');
  });

  it('defaults invalid strength to correction', () => {
    const json = JSON.stringify({
      reasoning_gaps: [
        { what_ai_did: 'a', what_broke: 'b', checkpoint: 'c', strength: 'unknown_type', category: 'depth_skip' },
      ],
    });
    const result = parseExtractResponse(json);
    expect(result.reasoningGaps[0].strength).toBe('correction');
  });

  it('defaults invalid category to verification_skip', () => {
    const json = JSON.stringify({
      reasoning_gaps: [
        { what_ai_did: 'a', what_broke: 'b', checkpoint: 'c', strength: 'correction', category: 'nonexistent' },
      ],
    });
    const result = parseExtractResponse(json);
    expect(result.reasoningGaps[0].category).toBe('verification_skip');
  });

  it('backward compat: parses legacy decision_points into reasoningGaps format', () => {
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
      user_language: 'en',
    });
    const result = parseExtractResponse(json);
    expect(result.reasoningGaps).toHaveLength(1);
    expect(result.reasoningGaps[0].what_ai_did).toBe('Listed 3 options');
    expect(result.reasoningGaps[0].what_broke).toBe('Just pick one');
    expect(result.reasoningGaps[0].checkpoint).toBe('Recommend one approach, not menus');
    expect(result.reasoningGaps[0].category).toBe('verification_skip');
    expect(result.context.topics).toEqual(['auth redesign']);
    expect(result.userLanguage).toBe('en');
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
