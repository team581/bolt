import type { Message, Thread } from "chat";
import { describe, expect, it } from "vite-plus/test";
import { mergeMessages, mergeRecentMessages, shouldRunReplyGate } from "../../../channels/slack-reply-routing.ts";
import { createBoltChannels, replyGateAllowsReply, THREAD_CONTEXT_MESSAGE_LIMIT } from "./channels.ts";

describe("Bolt Slack channels", () => {
	it("configures native handlers and bounded first-mention context", () => {
		const channels = createBoltChannels();

		expect(channels.threadContext).toEqual({ maxMessages: THREAD_CONTEXT_MESSAGE_LIMIT, addSystemMessage: true });
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
});
