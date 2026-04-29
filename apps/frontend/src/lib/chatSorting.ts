import type { ChatConversationSummary } from '../services/api';

function toTimestamp(value: string): number {
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function sortChatConversationsByUpdatedAt(
  conversations: ChatConversationSummary[]
): ChatConversationSummary[] {
  return [...conversations].sort((left, right) => {
    const updatedDelta = toTimestamp(right.updated_at) - toTimestamp(left.updated_at);
    if (updatedDelta !== 0) return updatedDelta;
    return toTimestamp(right.created_at) - toTimestamp(left.created_at);
  });
}
