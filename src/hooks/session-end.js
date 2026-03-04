#!/usr/bin/env node
import { parseTranscript, extractConversation } from '../transcript.js';
import { filterSensitiveData } from '../privacy.js';
import { analyzeTranscript } from '../analyzer.js';
import { appendProposal } from '../proposals.js';
import { ensureProjectDir } from '../project.js';
import { updateProjectContext } from '../context.js';
import { updateGlobalContext, pruneGlobalContext } from '../global-context.js';
import { debug } from '../debug.js';

async function main() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  const { transcript_path } = JSON.parse(input);
  debug(`session-end: transcript_path=${transcript_path}`);
  if (!transcript_path) process.exit(0);

  const messages = await parseTranscript(transcript_path);
  debug(`session-end: ${messages.length} messages parsed`);
  if (messages.length < 4) {
    debug('session-end: too few messages, skipping');
    process.exit(0);
  }

  const conversation = extractConversation(messages);
  if (conversation.length < 200) {
    debug(`session-end: conversation too short (${conversation.length} chars), skipping`);
    process.exit(0);
  }
  const filtered = filterSensitiveData(conversation);
  debug(`session-end: analyzing ${filtered.length} chars`);

  const { rules, context } = await analyzeTranscript(filtered);
  debug(`session-end: analysis result — ${rules.length} rules, context=${context ? 'yes' : 'null'}`);

  for (const rule of rules) {
    await appendProposal({
      rule: typeof rule === 'string' ? rule : rule.text,
      evidence: typeof rule === 'string' ? '' : (rule.evidence || ''),
      source: transcript_path,
      scope: 'global',
    });
    debug(`session-end: proposal added — "${typeof rule === 'string' ? rule : rule.text}"`);
  }

  if (context) {
    const projectPath = process.cwd();
    const projectDir = await ensureProjectDir(projectPath);
    await updateProjectContext(projectDir, {
      decisions: context.decisions || [],
      open_questions: context.open_questions || [],
      summary: context.topics ? context.topics.join(', ') : null,
    });
    debug(`session-end: project context updated (${context.decisions?.length || 0} decisions, ${context.open_questions?.length || 0} questions)`);

    if (context.topics && context.topics.length > 0) {
      await updateGlobalContext(context.topics);
      await pruneGlobalContext();
      debug(`session-end: global context updated with ${context.topics.length} topics`);
    }
  }
}

main().catch((e) => {
  debug(`session-end: fatal error — ${e.message}\n${e.stack}`);
  process.exit(0);
});
