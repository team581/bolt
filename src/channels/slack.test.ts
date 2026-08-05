import type { AgentInstanceHandle, ConversationStreamChunk, DispatchReceipt } from "@flue/runtime";
import { describe, expect, it } from "vite-plus/test";
import { mergeRecentMessages, shouldRunReplyGate } from "./slack-reply-routing.ts";
import { streamAgentReply } from "./stream-agent-reply.ts";

describe("Slack agent reply streaming", () => {
	it("shows tool progress but only posts the final assistant step", async () => {
		const receipt: DispatchReceipt = {
			acceptedAt: "2026-08-05T04:00:00.000Z",
			submissionId: "current-submission",
			uid: "instance-uid",
		};
		const events: ConversationStreamChunk[] = [
			{
				type: "message-started",
				conversationId: "conversation",
				messageId: "current-message",
				submissionId: receipt.submissionId,
				position: { batch: 1, index: 0 },
			},
			{
				type: "message-delta",
				conversationId: "conversation",
				messageId: "current-message",
				kind: "reasoning",
				delta: "Internal reasoning",
				position: { batch: 1, index: 1 },
			},
			{
				type: "message-delta",
				conversationId: "conversation",
				messageId: "current-message",
				kind: "text",
				delta: "I'll inspect the repository.",
				position: { batch: 1, index: 2 },
			},
			{
				type: "tool-input",
				conversationId: "conversation",
				messageId: "current-message",
				toolCallId: "tool-1",
				toolName: "read",
				input: { path: "README.md" },
				position: { batch: 1, index: 3 },
			},
			{
				type: "tool-output",
				conversationId: "conversation",
				toolCallId: "tool-1",
				output: "contents",
				position: { batch: 2, index: 0 },
			},
			{
				type: "message-started",
				conversationId: "conversation",
				messageId: "current-message",
				submissionId: receipt.submissionId,
				position: { batch: 3, index: 0 },
			},
			{
				type: "message-delta",
				conversationId: "conversation",
				messageId: "current-message",
				kind: "text",
				delta: "Here is the final answer.",
				position: { batch: 3, index: 1 },
			},
		];
		const agent = {
			read: async (_receipt: DispatchReceipt, options?: { onEvent?(event: ConversationStreamChunk): void }) => {
				for (const event of events) options?.onEvent?.(event);
				return {
					data: {},
					submissionId: receipt.submissionId,
					text: "Here is the final answer.",
					uid: receipt.uid,
				};
			},
		} as unknown as AgentInstanceHandle;

		const chunks = [];
		for await (const chunk of streamAgentReply(agent, receipt)) chunks.push(chunk);

		expect(chunks).toEqual([
			{ type: "task_update", id: "tool-1", title: "Reading a file", status: "in_progress" },
			{ type: "task_update", id: "tool-1", title: "Reading a file", status: "complete" },
			{ type: "markdown_text", text: "Here is the final answer." },
		]);
	});

	it("always starts Bolt for mentions and DMs", () => {
		expect(shouldRunReplyGate(false, true)).toBe(false);
		expect(shouldRunReplyGate(true, false)).toBe(false);
	});

	it("gates unmentioned messages in subscribed threads", () => {
		expect(shouldRunReplyGate(false, false)).toBe(true);
	});

	it("gives the reply gate only a bounded, deduplicated recent context", () => {
		const history = Array.from({ length: 10 }, (_, index) => ({ id: String(index + 1) }));
		const messages = mergeRecentMessages(history, [{ id: "10" }, { id: "11" }]);

		expect(messages.map(({ id }) => id)).toEqual(["4", "5", "6", "7", "8", "9", "10", "11"]);
	});
});
