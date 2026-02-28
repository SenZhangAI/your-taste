#!/usr/bin/env node
import { readFile } from 'fs/promises';
import { loadContext, renderContext } from '../context.js';

const MAX_CHARS = 4000;

export async function buildUserPromptContext() {
  let framework = '';
  try {
    framework = await readFile(
      new URL('../../prompts/thinking-framework.md', import.meta.url),
      'utf8',
    );
  } catch {
    // Template missing — degrade gracefully
  }

  const ctx = await loadContext();
  const contextText = renderContext(ctx);

  const sections = [framework, contextText].filter(Boolean);
  if (sections.length === 0) return null;

  const combined = sections.join('\n\n');

  // Size guard: framework is essential, context is nice-to-have
  if (combined.length > MAX_CHARS && framework) {
    return framework;
  }

  return combined;
}

async function main() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  const additionalContext = await buildUserPromptContext();
  if (!additionalContext) process.exit(0);

  console.log(JSON.stringify({
    hookSpecificOutput: { additionalContext },
  }));
}

main().catch(() => process.exit(0));
