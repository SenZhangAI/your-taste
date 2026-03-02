import { createReadStream } from 'fs';
import { createInterface } from 'readline';

export async function parseTranscript(transcriptPath) {
  const messages = [];
  const rl = createInterface({
    input: createReadStream(transcriptPath),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      messages.push(JSON.parse(line));
    } catch {
      // Skip malformed lines
    }
  }

  return messages;
}

/**
 * Extract human-readable conversation from parsed transcript messages.
 * Filters out tool_use, tool_result, and system messages -- only keeps
 * human text and assistant text content.
 *
 * When compact=true (for taste analysis), strips system-generated tags
 * from human messages and caps each message to keep only decision-relevant text.
 */
export function extractConversation(messages, { compact = false } = {}) {
  const lines = [];

  for (const msg of messages) {
    const role = resolveRole(msg);
    if (!role) continue;

    let text = extractText(msg.message?.content ?? msg.content);
    if (!text) continue;

    if (compact) {
      text = compactMessage(text, role);
      if (!text) continue;
    }

    lines.push(`${role}: ${text}`);
  }

  return lines.join('\n\n');
}

// System-generated tags in Claude Code user messages — no taste signal
const SYSTEM_TAG_RE = /<(?:system-reminder|task-notification|command-name|command-message|command-args|local-command-stdout|local-command-caveat|claude-mem-context|user-prompt-submit-hook)[^>]*>[\s\S]*?<\/(?:system-reminder|task-notification|command-name|command-message|command-args|local-command-stdout|local-command-caveat|claude-mem-context|user-prompt-submit-hook)>/g;

// Human: 500 chars after stripping system tags — taste signal is in short decisions
// Assistant: 300 chars — just enough to show what was proposed
const HUMAN_CAP = 500;
const ASSISTANT_CAP = 300;

function compactMessage(text, role) {
  if (role === 'human') {
    text = text.replace(SYSTEM_TAG_RE, '').trim();
    if (!text) return null;
    if (text.length > HUMAN_CAP) text = text.slice(0, HUMAN_CAP) + '...';
  } else {
    if (text.length > ASSISTANT_CAP) text = text.slice(0, ASSISTANT_CAP) + '...';
  }
  return text;
}

function resolveRole(msg) {
  // Claude Code JSONL uses top-level `type` field: "user" or "assistant"
  const type = msg.type;
  const role = msg.message?.role ?? msg.role;

  if (type === 'user' || role === 'user') return 'human';
  if (type === 'assistant' || role === 'assistant') return 'assistant';
  return null;
}

function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const textParts = content
      .filter(block => block.type === 'text')
      .map(block => block.text);
    return textParts.length > 0 ? textParts.join('\n') : null;
  }
  return null;
}
