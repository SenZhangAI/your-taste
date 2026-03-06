#!/usr/bin/env node
import { parseTranscript, extractConversation } from '../transcript.js';
import { filterSensitiveData } from '../privacy.js';
import { extractSignals } from '../analyzer.js';
import { appendSignals } from '../signals.js';
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

  const { reasoningGaps, context } = await extractSignals(filtered);
  debug(`session-end: extracted ${reasoningGaps.length} reasoning gaps, context=${context ? 'yes' : 'null'}`);

  if (reasoningGaps.length > 0) {
    await appendSignals(transcript_path, reasoningGaps, context);
    debug(`session-end: ${reasoningGaps.length} reasoning gaps saved to signals.jsonl`);
  }

  if (context) {
    const projectPath = process.cwd();
    const projectDir = await ensureProjectDir(projectPath);
    await updateProjectContext(projectDir, {
      decisions: context.decisions || [],
      open_questions: context.open_questions || [],
      summary: context.topics ? context.topics.join(', ') : null,
    });
    debug(`session-end: project context updated`);

    if (context.topics && context.topics.length > 0) {
      await updateGlobalContext(context.topics);
      await pruneGlobalContext();
      debug(`session-end: global context updated with ${context.topics.length} topics`);
    }
  }
}

main().catch((e) => {
  debug(`session-end: fatal error — ${e.message}\n${e.stack}`);
  const isInfra = /timeout|ECONNREFUSED|ECONNRESET|API error [5]\d{2}/i.test(e.message);
  if (isInfra) {
    // 基础设施故障（LLM 不可达、超时）— 静默降级
    process.exit(0);
  }
  // 代码 bug — 暴露给开发者
  console.log(JSON.stringify({ result: `your-taste: session-end error — ${e.message}` }));
  process.exit(2);
});
