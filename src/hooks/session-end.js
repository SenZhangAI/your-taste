#!/usr/bin/env node
// Runs automatically when a Claude Code session ends.
// Reads the conversation transcript, analyzes for preference signals,
// and updates the taste profile.

import { parseTranscript, extractConversation } from '../transcript.js';
import { filterSensitiveData } from '../privacy.js';
import { readProfile, updateProfile } from '../profile.js';
import { analyzeTranscript } from '../analyzer.js';

async function main() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  const { transcript_path } = JSON.parse(input);
  if (!transcript_path) process.exit(0);

  // Parse transcript
  const messages = await parseTranscript(transcript_path);
  if (messages.length < 4) process.exit(0); // Too short, skip

  // Extract and filter
  const conversation = extractConversation(messages);
  if (conversation.length < 200) process.exit(0); // Not enough content
  const filtered = filterSensitiveData(conversation);

  // Analyze
  const { signals } = await analyzeTranscript(filtered);
  if (signals.length === 0) process.exit(0);

  // Update profile
  const profile = await readProfile();
  await updateProfile(profile, signals);
}

main().catch(() => process.exit(0)); // Never block session exit
