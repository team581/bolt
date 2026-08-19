import { AgentChannels } from "@mastra/core/channels";
import { RequestContext } from "@mastra/core/request-context";
import type { Message, Thread } from "chat";
import { describe, expect, it, vi } from "vite-plus/test";
import { mergeMessages, mergeRecentMessages, shouldRunReplyGate } from "../../../channels/slack-reply-routing.ts";
import { createBoltChannels, replyGateAllowsReply } from "./channels.ts";
import { boltChatChannelOutputProcessor } from "./processors/output/channel-render.ts";

describe("Bolt Slack channels", () => {
	it("configures native handlers", () => {
		const channels = createBoltChannels();

		expect(typeof channels.handlers?.onDirectMessage).toBe("function");
		expect(typeof channels.handlers?.onMention).toBe("function");
		expect(typeof channels.handlers?.onSubscribedMessage).toBe("function");
	});

	it("always starts Bolt for mentions and DMs", () => {
		expect(shouldRunReplyGate(false, true)).toBe(false);
		expect(shouldRunReplyGate(true, false)).toBe(false);
	});

	it("gates unmentioned messages in subscribed threads", () => {
		expect(shouldRunReplyGate(false, false)).toBe(true);
	});

	it("defaults to replying when the reply gate context cannot be fetched", async () => {
		const thread = {
			id: "slack:C123:456.789",
			adapter: { fetchMessages: () => Promise.reject(new Error("Slack unavailable")) },
		} as unknown as Thread;

		expect(await replyGateAllowsReply(thread, {} as Message)).toBe(true);
	});

	it("deduplicates thread context and bounds reply-gate context", () => {
		const history = Array.from({ length: 10 }, (_, index) => ({ id: String(index + 1) }));
		expect(mergeMessages(history, [{ id: "10" }, { id: "11" }]).map(({ id }) => id)).toEqual([
			"1",
			"2",
			"3",
			"4",
			"5",
			"6",
			"7",
			"8",
			"9",
			"10",
			"11",
		]);
		expect(mergeRecentMessages(history, [{ id: "10" }, { id: "11" }]).map(({ id }) => id)).toEqual([
			"4",
			"5",
			"6",
			"7",
			"8",
			"9",
			"10",
			"11",
		]);
	});

	it("finishes streaming channel rendering before a run completes", async () => {
		const streamEnded = vi.fn();
		let postedText = "";
		const post = vi.fn(async (message: unknown) => {
			for await (const chunk of message as AsyncIterable<unknown>) {
				if (typeof chunk === "string") postedText += chunk;
			}
			return { id: "message-1" };
		});
		const channels = new AgentChannels({ adapters: {} });
		const requestContext = new RequestContext();
		requestContext.set("__mastra_chat_channel_render", {
			adapter: { name: "slack" },
			chatThread: { post },
			platform: "slack",
			streaming: { enabled: true },
			toolDisplay: "grouped",
			channelToolNames: new Set(),
			onApprovalPosted: vi.fn(),
			getPendingApproval: vi.fn(),
			takePendingApproval: vi.fn(),
			wrapStream: async function* (stream: AsyncIterable<never>) {
				try {
					yield* stream;
				} finally {
					streamEnded();
				}
			},
			typingGate: { active: false },
		});
		const state = {};
		const process = (part: unknown) =>
			boltChatChannelOutputProcessor.processOutputStream?.({
				part: part as never,
				streamParts: [part] as never,
				state,
				requestContext,
				agent: { getChannels: () => channels } as never,
				retryCount: 0,
				abort: (reason?: string): never => {
					throw new Error(reason);
				},
			});

		await process({ type: "text-delta", payload: { text: "Finished recap" } });
		await process({ type: "finish", payload: { finishReason: "stop" } });

		expect(streamEnded).toHaveBeenCalledOnce();
		expect(post).toHaveBeenCalledOnce();
		expect(postedText).toBe("Finished recap");
	});
});
