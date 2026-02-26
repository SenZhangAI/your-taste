import { describe, it, expect } from 'vitest';
import { parseTranscript, extractConversation } from '../src/transcript.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, 'fixtures', 'sample-transcript.jsonl');

describe('transcript', () => {
  it('parses JSONL into message array', async () => {
    const messages = await parseTranscript(FIXTURE);
    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0]).toHaveProperty('type');
    expect(messages[0]).toHaveProperty('message');
    expect(messages[0]).toHaveProperty('uuid');
  });

  it('extracts human and assistant text', async () => {
    const messages = await parseTranscript(FIXTURE);
    const text = extractConversation(messages);
    expect(text).toContain('human:');
    expect(text).toContain('assistant:');
  });

  it('filters out tool use blocks from conversation text', async () => {
    const messages = await parseTranscript(FIXTURE);
    const text = extractConversation(messages);
    expect(text).not.toContain('tool_use');
    expect(text).not.toContain('tool_use_id');
    expect(text).not.toContain('toolu_');
  });

  it('filters out tool result messages from conversation text', async () => {
    const messages = await parseTranscript(FIXTURE);
    const text = extractConversation(messages);
    // Tool result messages (user messages containing only tool_result blocks) should be excluded
    expect(text).not.toContain('tool_result');
    expect(text).not.toContain('public class UserService');
  });

  it('preserves conversation content in order', async () => {
    const messages = await parseTranscript(FIXTURE);
    const text = extractConversation(messages);
    const humanIdx = text.indexOf('human: Refactor');
    const assistantIdx = text.indexOf('assistant:');
    expect(humanIdx).toBeLessThan(assistantIdx);
  });
});
