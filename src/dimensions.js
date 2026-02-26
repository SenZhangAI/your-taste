// src/dimensions.js

/**
 * Meta-dimensions: personality traits that manifest across all coding domains.
 * Each dimension has a spectrum from 0.0 to 1.0.
 * The score captures DIRECTION (taste), not SKILL LEVEL.
 * AI applies the direction at professional best-practice level.
 */
export const DIMENSIONS = {
  risk_tolerance: {
    name: 'risk_tolerance',
    low: 'cautious — gradual changes, rollback plans, proven patterns',
    high: 'bold — clean breaks, new approaches, move fast',
  },
  complexity_preference: {
    name: 'complexity_preference',
    low: 'minimalist — fewer abstractions, less code, simpler solutions',
    high: 'comprehensive — thorough coverage, complete abstractions, full documentation',
  },
  autonomy_expectation: {
    name: 'autonomy_expectation',
    low: 'collaborative — check before acting, present options, confirm decisions',
    high: 'autonomous — act independently, decide and execute, minimize questions',
  },
  communication_style: {
    name: 'communication_style',
    low: 'direct — brief answers, no fluff, action-oriented',
    high: 'detailed — thorough explanations, context, reasoning',
  },
  quality_vs_speed: {
    name: 'quality_vs_speed',
    low: 'pragmatic — ship fast, iterate, good enough is enough',
    high: 'perfectionist — quality first, clean code, thorough testing',
  },
  exploration_tendency: {
    name: 'exploration_tendency',
    low: 'focused — stick to the task, minimal scope, targeted changes',
    high: 'exploratory — improve surroundings, suggest better approaches, broader scope',
  },
};

export const DIMENSION_NAMES = Object.keys(DIMENSIONS);
