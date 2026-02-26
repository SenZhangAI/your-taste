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
 */
export function extractConversation(messages) {
  const lines = [];

  for (const msg of messages) {
    const role = resolveRole(msg);
    if (!role) continue;

    const text = extractText(msg.message?.content ?? msg.content);
    if (!text) continue;

    lines.push(`${role}: ${text}`);
  }

  return lines.join('\n\n');
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
