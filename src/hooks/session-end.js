#!/usr/bin/env node
import { parseTranscript, extractConversation } from '../transcript.js';
import { filterSensitiveData } from '../privacy.js';
import { readProfile, updateProfile } from '../profile.js';
import { analyzeTranscript } from '../analyzer.js';
import { readPending, updatePending, getPendingRuleTexts } from '../pending.js';
import { ensureProjectDir } from '../project.js';
import { updateProjectContext } from '../context.js';
import { updateGlobalContext, pruneGlobalContext } from '../global-context.js';

async function main() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  const { transcript_path } = JSON.parse(input);
  if (!transcript_path) process.exit(0);

  const messages = await parseTranscript(transcript_path);
  if (messages.length < 4) process.exit(0);

  const conversation = extractConversation(messages);
  if (conversation.length < 200) process.exit(0);
  const filtered = filterSensitiveData(conversation);

  const pending = await readPending();
  const pendingTexts = getPendingRuleTexts(pending);

  const { signals, rules, context } = await analyzeTranscript(filtered, pendingTexts);

  if (signals.length > 0) {
    const profile = await readProfile();
    await updateProfile(profile, signals);
  }

  if (rules.length > 0) {
    await updatePending(pending, rules);
  }

  // Write project-scoped context + global context
  if (context) {
    const projectPath = process.cwd();
    const projectDir = await ensureProjectDir(projectPath);
    await updateProjectContext(projectDir, {
      decisions: context.decisions || [],
      open_questions: context.open_questions || [],
      summary: context.topics ? context.topics.join(', ') : null,
    });

    if (context.topics && context.topics.length > 0) {
      await updateGlobalContext(context.topics);
      await pruneGlobalContext();
    }
  }
}

main().catch(() => process.exit(0));
