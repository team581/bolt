import { createPostgresState } from "@chat-adapter/state-pg";
import { init } from "@flue/runtime";
import { Chat, StreamingPlan } from "chat";
import type { Message, MessageContext, Thread } from "chat";
import { Bolt } from "../agents/bolt.ts";
import { decideWhetherBoltShouldReply } from "../agents/slack-reply-gate.ts";
import { pool } from "../db.ts";
import { reportError } from "../sentry.ts";
import { createConfiguredSlackAdapter } from "./slack-adapter.ts";
import { mergeRecentMessages, REPLY_GATE_CONTEXT_MESSAGE_LIMIT, shouldRunReplyGate } from "./slack-reply-routing.ts";
import { streamAgentReply } from "./stream-agent-reply.ts";

export function createSlackChannel(): {
	handleWebhook(request: Request): Promise<Response>;
	start(): Promise<void>;
	stop(): Promise<void>;
} {
	const slackAdapter = createConfiguredSlackAdapter();
	const bot = new Chat({
		userName: "Bolt",
		adapters: { slack: slackAdapter },
		state: createPostgresState({ client: pool }),
		concurrency: "queue",
	});

	bot.onNewMention(async (thread, message, context) => {
		await thread.subscribe();
		await respond(thread, message, context, true);
	});

	bot.onSubscribedMessage((thread, message, context) => respond(thread, message, context, message.isMention));

	return {
		handleWebhook: (request) => bot.webhooks.slack(request),
		async start() {
			if (!slackAdapter.isSocketMode) return;

			try {
				await bot.initialize();
			} catch (error) {
				reportError(error, "Failed to initialize Slack Socket Mode");
				throw error;
			}
		},
		stop: () => bot.shutdown(),
	};
}

async function respond(
	thread: Thread,
	message: Message,
	context?: MessageContext,
	wasMentioned = false,
): Promise<void> {
	const messages = [...(context?.skipped ?? []), message];
	if (shouldRunReplyGate(thread.isDM, wasMentioned) && !(await replyGateAllowsReply(thread, messages))) return;

	await thread.startTyping();
	try {
		const attachmentMessageIds = messages
			.filter((candidate) => candidate.attachments.some(isWpilogAttachment))
			.map((candidate) => candidate.id);
		const agent = init(Bolt, { id: thread.id });
		const receipt = await agent.dispatch({
			initialData: {
				channelId: thread.channelId,
				threadId: thread.id,
				isDM: thread.isDM,
				startedBy: messages[0]?.author.userId,
				startedAt: messages[0]?.metadata.dateSent.toISOString() ?? new Date().toISOString(),
			},
			message: {
				kind: "signal",
				type: "slack.message",
				body: messageBody(messages),
				attributes: {
					messageId: message.id,
					userId: message.author.userId,
					isDirectMessage: String(thread.isDM),
					...(attachmentMessageIds.length === 0 ? {} : { attachmentMessageIds: JSON.stringify(attachmentMessageIds) }),
				},
			},
			idempotencyKey: message.id,
		});

		await thread.post(new StreamingPlan(streamAgentReply(agent, receipt), { groupTasks: "plan" }));
	} catch (error) {
		reportError(error, "Failed to respond to Slack message", { threadId: thread.id });
		await thread.post("I ran into an error while working on that. Please try again.");
	} finally {
		await thread.startTyping("");
	}
}

async function replyGateAllowsReply(thread: Thread, messages: Message[]): Promise<boolean> {
	try {
		const history = await thread.adapter.fetchMessages(thread.id, {
			limit: REPLY_GATE_CONTEXT_MESSAGE_LIMIT,
			direction: "backward",
		});
		const context = mergeRecentMessages(history.messages, messages);
		return decideWhetherBoltShouldReply(messageBody(context));
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

function isWpilogAttachment({ name }: Message["attachments"][number]): boolean {
	return name?.toLowerCase().endsWith(".wpilog") ?? false;
}
