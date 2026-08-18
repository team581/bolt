import type { ChannelConfig, ChannelHandler } from "@mastra/core/channels";
import type { Message, Thread } from "chat";
import { createConfiguredSlackAdapter } from "../../../channels/slack-adapter.ts";
import {
	mergeMessages,
	mergeRecentMessages,
	REPLY_GATE_CONTEXT_MESSAGE_LIMIT,
} from "../../../channels/slack-reply-routing.ts";
import { reportError } from "../../../sentry.ts";
import { decideWhetherBoltShouldReply } from "./reply-gate.ts";
import { slackConversationId, withBoltSandbox } from "./sandbox.ts";

export const THREAD_CONTEXT_MESSAGE_LIMIT = 10;

export function createBoltChannels(): ChannelConfig {
	return {
		adapters: {
			slack: {
				adapter: createConfiguredSlackAdapter(),
				streaming: true,
				toolDisplay: "grouped",
				typingStatus: true,
				formatError: () => "I ran into an error while working on that. Please try again.",
			},
		},
		threadContext: { maxMessages: THREAD_CONTEXT_MESSAGE_LIMIT, addSystemMessage: true },
		resolveResourceId: ({ thread }) => slackConversationId(thread.id),
		resolveThreadId: ({ thread }) => slackConversationId(thread.id),
		handlers: {
			onDirectMessage: createHandler({ includeThreadContext: false, runReplyGate: false }),
			onMention: createHandler({ includeThreadContext: true, runReplyGate: false }),
			onSubscribedMessage: createHandler({ includeThreadContext: false, runReplyGate: true }),
		},
	};
}

function createHandler(options: { includeThreadContext: boolean; runReplyGate: boolean }): ChannelHandler {
	return async (thread, message, defaultHandler, context) => {
		if (options.runReplyGate && message.isMention !== true && !(await replyGateAllowsReply(thread, message))) return;

		await thread.startTyping("is preparing the workspace…");
		const messages = options.includeThreadContext ? await messagesWithThreadContext(thread, message) : [message];
		try {
			await withBoltSandbox({
				threadId: thread.id,
				messages,
				requestContext: context.requestContext,
				run: () => defaultHandler(thread, message),
			});
		} catch (error) {
			reportError(error, "Failed to respond to Slack message", { threadId: thread.id });
			throw error;
		}
	};
}

async function messagesWithThreadContext(thread: Thread, message: Message): Promise<Message[]> {
	try {
		const history = await thread.adapter.fetchMessages(thread.id, {
			limit: THREAD_CONTEXT_MESSAGE_LIMIT,
			direction: "backward",
		});
		return mergeMessages(history.messages, [message]).slice(-THREAD_CONTEXT_MESSAGE_LIMIT);
	} catch (error) {
		reportError(error, "Failed to fetch Slack thread attachments; continuing with the current message", {
			threadId: thread.id,
		});
		return [message];
	}
}

export async function replyGateAllowsReply(thread: Thread, message: Message): Promise<boolean> {
	try {
		const history = await thread.adapter.fetchMessages(thread.id, {
			limit: REPLY_GATE_CONTEXT_MESSAGE_LIMIT,
			direction: "backward",
		});
		return await decideWhetherBoltShouldReply(messageBody(mergeRecentMessages(history.messages, [message])));
	} catch (error) {
		reportError(error, "Slack reply gate failed; defaulting to a reply", { threadId: thread.id });
		return true;
	}
}

function messageBody(messages: Message[]): string {
	return messages
		.map((message) => {
			const attachments = message.attachments.map(({ name, mimeType, size }) => ({ name, mimeType, size }));
			const files = attachments.length === 0 ? "" : `\nAttachments: ${JSON.stringify(attachments)}`;
			return `${message.author.fullName}: ${message.text}${files}`;
		})
		.join("\n\n");
}
