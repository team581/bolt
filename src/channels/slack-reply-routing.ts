export const REPLY_GATE_CONTEXT_MESSAGE_LIMIT = 8;

export function shouldRunReplyGate(isDM: boolean, wasMentioned: boolean): boolean {
	return !isDM && !wasMentioned;
}

export function mergeRecentMessages<T extends { id: string }>(history: T[], incoming: T[]): T[] {
	const messagesById = new Map<string, T>();
	for (const message of [...history, ...incoming]) messagesById.set(message.id, message);
	return [...messagesById.values()].slice(-REPLY_GATE_CONTEXT_MESSAGE_LIMIT);
}
