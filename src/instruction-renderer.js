// src/instruction-renderer.js

import { extractSection } from './observations.js';

const OBSERVATIONS_HEADER = "Working context for this user (learned from past collaboration):";

export function renderFromObservations(observationsMarkdown) {
  if (!observationsMarkdown) return null;

  const sections = [];

  // Reasoning Checkpoints excluded — injected by UserPromptSubmit hook instead

  // Domain Reasoning (new) + Working Principles / Behavioral Patterns (legacy)
  const domainHeaders = ['Domain Reasoning', '领域推理', 'Working Principles', '工作原则', 'Behavioral Patterns', '行为模式'];
  let domain = null;
  let domainLabel = 'Domain Reasoning';
  for (const h of domainHeaders) {
    domain = extractSection(observationsMarkdown, h);
    if (domain) {
      domainLabel = h;
      break;
    }
  }

  // Failure Patterns (new) + Common Misreads (legacy)
  const failureHeaders = ['Failure Patterns', '失败模式', 'Common Misreads', '常见误读'];
  let failures = null;
  let failureLabel = 'Failure Patterns';
  for (const h of failureHeaders) {
    failures = extractSection(observationsMarkdown, h);
    if (failures) {
      failureLabel = h;
      break;
    }
  }

  if (domain) sections.push(`### ${domainLabel}\n\n${domain}`);
  if (failures) sections.push(`### ${failureLabel}\n\n${failures}`);

  if (sections.length === 0) return null;

  return `${OBSERVATIONS_HEADER}\n\n${sections.join('\n\n')}`;
}
