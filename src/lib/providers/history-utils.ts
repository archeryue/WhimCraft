/**
 * History Utilities for AI Providers
 *
 * Gemini API requires conversation history to start with a 'user' role message.
 * These utilities help trim and format conversation history properly.
 */

export interface MessageWithRole {
  role: string;
  content: string;
}

/**
 * Trims conversation history to the specified limit while ensuring
 * it starts with a 'user' role message (required by Gemini API).
 *
 * @param messages - Array of messages to trim
 * @param limit - Maximum number of messages to keep (takes from the end)
 * @returns Trimmed messages array that starts with a user message
 */
export function trimHistory<T extends MessageWithRole>(
  messages: T[],
  limit: number
): T[] {
  // Handle edge case: limit <= 0 returns empty array
  if (limit <= 0) {
    return [];
  }

  // Take the last N messages
  let result = messages.slice(-limit);

  // Remove leading non-user messages (assistant/model/system)
  while (result.length > 0 && result[0].role !== 'user') {
    result = result.slice(1);
  }

  return result;
}
