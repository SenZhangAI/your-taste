// src/instruction-renderer.js

import { extractSection } from './observations.js';

const OBSERVATIONS_HEADER = "Working context for this user (learned from past collaboration):";

export function renderFromObservations(observationsMarkdown) {
  if (!observationsMarkdown) return null;

  const sections = [];

  // Thinking Patterns excluded — injected by UserPromptSubmit hook instead
  const principlesHeaders = ['Working Principles', '工作原则', 'Behavioral Patterns', '行为模式'];
  const misreadsHeaders = ['Common Misreads', '常见误读'];

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

  if (principles) sections.push(`### ${principlesLabel}\n\n${principles}`);
  if (misreads) sections.push(`### Common Misreads\n\n${misreads}`);

  if (sections.length === 0) return null;

  return `${OBSERVATIONS_HEADER}\n\n${sections.join('\n\n')}`;
}
