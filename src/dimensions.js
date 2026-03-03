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
    personalityNarrative: {
      low: 'You value stability and careful planning — changes are deliberate, with rollback plans ready. This protects your team and your systems.',
      high: 'You favor clean breaks over patching — this takes judgment and confidence. You trust your ability to rebuild better.',
    },
  },
  complexity_preference: {
    name: 'complexity_preference',
    low: 'minimalist — fewer abstractions, less code, simpler solutions',
    high: 'comprehensive — thorough coverage, complete abstractions, full documentation',
    personalityNarrative: {
      low: 'You cut through complexity to find the simple solution. Less code means fewer bugs, clearer intent, and easier maintenance.',
      high: 'You build thorough, complete solutions. Your attention to coverage means fewer surprises in production.',
    },
  },
  autonomy_expectation: {
    name: 'autonomy_expectation',
    low: 'collaborative — AI checks before acting, presents options, confirms decisions',
    high: 'autonomous — AI acts independently, decides and executes, minimizes questions',
    personalityNarrative: {
      low: 'You prefer AI to check in before acting. Shared decision-making builds trust and catches blind spots.',
      high: 'You expect AI to act decisively without asking. Less back-and-forth, more momentum.',
    },
  },
  communication_style: {
    name: 'communication_style',
    low: 'direct — brief answers, no fluff, action-oriented',
    high: 'detailed — thorough explanations, context, reasoning',
    personalityNarrative: {
      low: 'You respect everyone\'s time with concise communication. No fluff, no padding — just what matters.',
      high: 'You believe understanding requires context. Thorough explanations prevent misunderstandings and build shared knowledge.',
    },
  },
  quality_vs_speed: {
    name: 'quality_vs_speed',
    low: 'pragmatic — ship fast, iterate, good enough is enough',
    high: 'perfectionist — quality first, clean code, thorough testing',
    personalityNarrative: {
      low: 'You know when good enough IS enough. Shipping fast and iterating beats perfection that never launches.',
      high: 'You hold a high quality bar because you know clean code compounds. Today\'s investment pays off in every future change.',
    },
  },
  exploration_tendency: {
    name: 'exploration_tendency',
    low: 'focused — stick to the task, minimal scope, targeted changes',
    high: 'exploratory — improve surroundings, suggest better approaches, broader scope',
    personalityNarrative: {
      low: 'You stay focused on the goal. Targeted changes with minimal scope keep things predictable and reviewable.',
      high: 'You see the bigger picture. Improving code you touch leaves the codebase better than you found it.',
    },
  },
};

export const DIMENSION_NAMES = Object.keys(DIMENSIONS);

export function getNarrative(dimensionName, score) {
  const dim = DIMENSIONS[dimensionName];
  if (!dim?.personalityNarrative) return null;
  if (score < 0.35) return dim.personalityNarrative.low;
  if (score > 0.65) return dim.personalityNarrative.high;
  return null;
}
