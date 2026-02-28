#!/usr/bin/env node
// Runs automatically when a Claude Code session ends.
// Reads the conversation transcript, analyzes for preference signals,
// and updates the taste profile and strategic context.

import { parseTranscript, extractConversation } from '../transcript.js';
import { filterSensitiveData } from '../privacy.js';
import { readProfile, updateProfile } from '../profile.js';
import { analyzeTranscript } from '../analyzer.js';
import { readPending, updatePending, getPendingRuleTexts } from '../pending.js';
import { updateContext, pruneContext } from '../context.js';

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

  // Read pending rules for prompt injection (dedup)
  const pending = await readPending();
  const pendingTexts = getPendingRuleTexts(pending);

  // Analyze — returns { signals, rules, context }
  const { signals, rules, context } = await analyzeTranscript(filtered, pendingTexts);

  // Update profile with dimension signals
  if (signals.length > 0) {
    const profile = await readProfile();
    await updateProfile(profile, signals);
  }

  // Accumulate candidate rules
  if (rules.length > 0) {
    await updatePending(pending, rules);
  }

  // Update strategic context
  if (context) {
    await updateContext(context);
    await pruneContext();
  }
}

main().catch(() => process.exit(0)); // Never block session exit
