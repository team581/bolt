import { createPostgresState } from "@chat-adapter/state-pg";
import { init } from "@flue/runtime";
import { Chat, StreamingPlan } from "chat";
import type { Message, MessageContext, Thread } from "chat";
import { Bolt } from "../agents/bolt.ts";
import { pool } from "../db.ts";
import { slackAdapter } from "./slack-adapter.ts";
import { streamAgentReply } from "./stream-agent-reply.ts";

const bot = new Chat({
	userName: "Bolt",
	adapters: { slack: slackAdapter },
	state: createPostgresState({ client: pool }),
	concurrency: "queue",
});

bot.onNewMention(async (thread, message, context) => {
	await thread.subscribe();
	await respond(thread, message, context);
});

bot.onSubscribedMessage(respond);

export function handleSlackWebhook(request: Request): Promise<Response> {
	return bot.webhooks.slack(request);
}

async function respond(thread: Thread, message: Message, context?: MessageContext): Promise<void> {
	await Promise.allSettled([thread.adapter.addReaction(thread.id, message.id, "eyes")]);

	try {
		const messages = [...(context?.skipped ?? []), message];
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

		await thread.post(new StreamingPlan(streamAgentReply(agent, receipt), { groupTasks: "timeline" }));
	} catch (error) {
		console.error("Failed to respond to Slack message", error);
		await thread.post("I ran into an error while working on that. Please try again.");
	} finally {
		await Promise.allSettled([thread.adapter.removeReaction(thread.id, message.id, "eyes")]);
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
