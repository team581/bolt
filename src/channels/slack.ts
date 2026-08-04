import { createPostgresState } from "@chat-adapter/state-pg";
import { AgentRunError, init } from "@flue/runtime";
import type { AgentInstanceHandle, ConversationStreamChunk, DispatchReceipt } from "@flue/runtime";
import { Chat, StreamingPlan } from "chat";
import type { Message, MessageContext, StreamChunk, Thread } from "chat";
import { Bolt } from "../agents/bolt.ts";
import { pool } from "../db.ts";
import { slackAdapter } from "./slack-adapter.ts";

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
	await Promise.allSettled([thread.startTyping(), thread.adapter.addReaction(thread.id, message.id, "eyes")]);

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

function streamAgentReply(agent: AgentInstanceHandle, receipt: DispatchReceipt): AsyncIterable<StreamChunk> {
	return {
		async *[Symbol.asyncIterator]() {
			const queue: StreamChunk[] = [];
			const activeTools = new Map<string, string>();
			let wake: (() => void) | undefined;
			let finished = false;
			let streamedText = "";
			let needsParagraph = false;

			const emit = (chunk: StreamChunk): void => {
				queue.push(chunk);
				wake?.();
				wake = undefined;
			};
			const emitText = (text: string): void => {
				if (!text) return;
				streamedText += text;
				emit({ type: "markdown_text", text });
			};

			const read = agent
				.read(receipt, {
					onEvent(event) {
						projectAgentEvent(event, {
							activeTools,
							emit,
							emitText,
							get needsParagraph() {
								return needsParagraph;
							},
							set needsParagraph(value: boolean) {
								needsParagraph = value;
							},
							get streamedText() {
								return streamedText;
							},
						});
					},
				})
				.then((reply) => {
					if (!streamedText) emitText(reply.text || "Done.");
					else if (reply.text.startsWith(streamedText)) emitText(reply.text.slice(streamedText.length));
				})
				.catch((error: unknown) => {
					console.error("Bolt agent run failed", error);
					for (const [id, title] of activeTools) {
						emit({ type: "task_update", id, title, status: "error", details: "Step failed" });
					}
					if (streamedText) emitText("\n\n");
					emitText(
						error instanceof AgentRunError && error.outcome === "aborted"
							? "I stopped working on that request."
							: "I ran into an error while working on that. Please try again.",
					);
				})
				.finally(() => {
					finished = true;
					wake?.();
					wake = undefined;
				});

			while (!finished || queue.length > 0) {
				const chunk = queue.shift();
				if (chunk) {
					yield chunk;
					continue;
				}
				await new Promise<void>((resolve) => {
					wake = resolve;
				});
			}
			await read;
		},
	};
}

interface AgentEventProjection {
	activeTools: Map<string, string>;
	emit(chunk: StreamChunk): void;
	emitText(text: string): void;
	needsParagraph: boolean;
	readonly streamedText: string;
}

function projectAgentEvent(event: ConversationStreamChunk, output: AgentEventProjection): void {
	switch (event.type) {
		case "message-started":
			if (output.streamedText) output.needsParagraph = true;
			break;
		case "message-delta":
			if (event.kind !== "text") break;
			if (output.needsParagraph) output.emitText("\n\n");
			output.needsParagraph = false;
			output.emitText(event.delta);
			break;
		case "tool-input": {
			const title = toolTitle(event.toolName);
			output.activeTools.set(event.toolCallId, title);
			output.emit({ type: "task_update", id: event.toolCallId, title, status: "in_progress" });
			break;
		}
		case "tool-output": {
			const title = output.activeTools.get(event.toolCallId) ?? "Completed a step";
			output.activeTools.delete(event.toolCallId);
			output.emit({ type: "task_update", id: event.toolCallId, title, status: "complete" });
			break;
		}
		case "tool-output-error": {
			const title = output.activeTools.get(event.toolCallId) ?? "Running a step";
			output.activeTools.delete(event.toolCallId);
			output.emit({ type: "task_update", id: event.toolCallId, title, status: "error", details: "Step failed" });
			break;
		}
	}
}

function toolTitle(toolName: string): string {
	const titles: Record<string, string> = {
		bash: "Running a command",
		edit: "Editing a file",
		glob: "Finding files",
		grep: "Searching files",
		read: "Reading a file",
		write: "Writing a file",
	};
	return titles[toolName] ?? `Using ${toolName.replaceAll("_", " ")}`;
}
