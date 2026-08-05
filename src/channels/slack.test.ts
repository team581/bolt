import type { AgentInstanceHandle, ConversationStreamChunk, DispatchReceipt } from "@flue/runtime";
import { describe, expect, it } from "vite-plus/test";
import { streamAgentReply } from "./stream-agent-reply.ts";

describe("Slack agent reply streaming", () => {
	it("ignores previous replies and deduplicates replayed chunks", async () => {
		const receipt: DispatchReceipt = {
			acceptedAt: "2026-08-05T04:00:00.000Z",
			submissionId: "current-submission",
			uid: "instance-uid",
		};
		const events: ConversationStreamChunk[] = [
			{
				type: "message-started",
				conversationId: "conversation",
				messageId: "previous-message",
				submissionId: "previous-submission",
				position: { batch: 1, index: 0 },
			},
			{
				type: "message-delta",
				conversationId: "conversation",
				messageId: "previous-message",
				kind: "text",
				delta: "Previous reply",
				position: { batch: 1, index: 1 },
			},
			{
				type: "message-started",
				conversationId: "conversation",
				messageId: "current-message",
				submissionId: receipt.submissionId,
				position: { batch: 2, index: 0 },
			},
			{
				type: "message-delta",
				conversationId: "conversation",
				messageId: "current-message",
				kind: "text",
				delta: "Current reply",
				position: { batch: 2, index: 1 },
			},
			{
				type: "message-delta",
				conversationId: "conversation",
				messageId: "current-message",
				kind: "text",
				delta: "Current reply",
				position: { batch: 2, index: 1 },
			},
		];
		const agent = {
			read: async (_receipt: DispatchReceipt, options?: { onEvent?(event: ConversationStreamChunk): void }) => {
				for (const event of events) options?.onEvent?.(event);
				return { data: {}, submissionId: receipt.submissionId, text: "Current reply", uid: receipt.uid };
			},
		} as unknown as AgentInstanceHandle;

		const chunks = [];
		for await (const chunk of streamAgentReply(agent, receipt)) chunks.push(chunk);

		expect(chunks).toEqual([{ type: "markdown_text", text: "Current reply" }]);
	});
});
