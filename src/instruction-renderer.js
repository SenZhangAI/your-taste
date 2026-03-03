// src/instruction-renderer.js

import { extractSection } from './observations.js';

const OBSERVATIONS_HEADER = "Working context for this user (learned from past collaboration):";

export function renderFromObservations(observationsMarkdown) {
  if (!observationsMarkdown) return null;

  const sections = [];

  const thinkingHeaders = ['Thinking Patterns', '思维模式'];
  // Try new header first, fall back to legacy — ensures old observations.md keeps working
  const principlesHeaders = ['Working Principles', '工作原则', 'Behavioral Patterns', '行为模式'];
  const misreadsHeaders = ['Common Misreads', '常见误读'];

  let thinking = null;
  for (const h of thinkingHeaders) {
    thinking = extractSection(observationsMarkdown, h);
    if (thinking) break;
  }

  let principles = null;
  let principlesLabel = 'Working Principles';
  for (const h of principlesHeaders) {
    principles = extractSection(observationsMarkdown, h);
    if (principles) {
      principlesLabel = h;
      break;
    }
  }

  let misreads = null;
  for (const h of misreadsHeaders) {
    misreads = extractSection(observationsMarkdown, h);
    if (misreads) break;
  }

  if (thinking) sections.push(`### Thinking Patterns\n\n${thinking}`);
  if (principles) sections.push(`### ${principlesLabel}\n\n${principles}`);
  if (misreads) sections.push(`### Common Misreads\n\n${misreads}`);

  if (sections.length === 0) return null;

  return `${OBSERVATIONS_HEADER}\n\n${sections.join('\n\n')}`;
}

const TEMPLATES = {
  risk_tolerance: {
    low: 'Prefer gradual migration over rewrites. Include rollback plans for production changes. Favor proven patterns over novel approaches.',
    high: 'Prefer clean rewrites over patching. Skip backward compatibility unless there\'s a running production dependency. Favor decisive action.',
  },
  complexity_preference: {
    low: 'Keep solutions minimal. Fewer abstractions, less code, simpler is better. Only add complexity when it solves a real problem.',
    high: 'Provide thorough coverage. Include complete abstractions, comprehensive error handling, and full documentation where appropriate.',
  },
  autonomy_expectation: {
    low: 'Check before acting on significant decisions. Present options and confirm direction before implementing.',
    high: 'Act independently. Decide and execute without asking for confirmation on routine decisions. Minimize questions.',
  },
  communication_style: {
    low: 'Keep responses brief and action-oriented. Lead with the answer or action, skip lengthy explanations. No filler.',
    high: 'Provide thorough explanations with context and reasoning. Explain the why, not just the what.',
  },
  quality_vs_speed: {
    low: 'Ship fast and iterate. Good enough is enough. Don\'t over-engineer or gold-plate.',
    high: 'Quality first. Don\'t cut corners on correctness or code clarity to save time. Clean code over quick code.',
  },
  exploration_tendency: {
    low: 'Stay focused on the specific task. Minimal scope, targeted changes. Don\'t refactor surroundings.',
    high: 'Look for improvement opportunities beyond the immediate task. Suggest better approaches, refactor when beneficial.',
  },
};

const HEADER = "This developer's working style preferences (learned from past sessions):";

const QUALITY_FLOOR = 'Apply these preferences on top of professional best practices. Never compromise error handling at system boundaries, security best practices, or data integrity.';

const MIN_CONFIDENCE = 0.3;
const MID_LOW = 0.35;
const MID_HIGH = 0.65;

function selectInstruction(dimension, score, confidence) {
  if (confidence < MIN_CONFIDENCE) return null;
  if (score >= MID_LOW && score <= MID_HIGH) return null;

  const template = TEMPLATES[dimension];
  if (!template) return null;

  return score < MID_LOW ? template.low : template.high;
}

export function renderInstructions(profile) {
  const instructions = [];

  for (const [name, dim] of Object.entries(profile.dimensions)) {
    const instruction = selectInstruction(name, dim.score, dim.confidence);
    if (instruction) instructions.push(instruction);
  }

  if (instructions.length === 0) return null;

  const body = instructions.map(i => `- ${i}`).join('\n');
  return `${HEADER}\n\n${body}\n\n${QUALITY_FLOOR}`;
}
