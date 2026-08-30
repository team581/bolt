import { AgentChannels } from "@mastra/core/channels";
import type { OutputProcessor } from "@mastra/core/processors";
import { RequestContext } from "@mastra/core/request-context";
import { ThreadImpl, type Adapter, type Message, type StateAdapter, type Thread } from "chat";
import { describe, expect, it, vi } from "vite-plus/test";
import { mergeMessages, mergeRecentMessages, shouldRunReplyGate } from "../../../channels/slack-reply-routing.ts";
import { boltChannels, createBoltChannels, replyGateAllowsReply } from "./channels.ts";
import boltConfig from "./config.ts";

const CHAT_CHANNEL_RENDER_CONTEXT_KEY = "__mastra_chat_channel_render";

describe("Bolt Slack channels", () => {
	it("configures native handlers", () => {
		const channels = createBoltChannels();

		expect(typeof channels.channelConfig.handlers?.onDirectMessage).toBe("function");
		expect(typeof channels.channelConfig.handlers?.onMention).toBe("function");
		expect(typeof channels.channelConfig.handlers?.onSubscribedMessage).toBe("function");
	});

	it("uses exactly one Mastra channel renderer for normal turns", () => {
		expect(boltConfig.outputProcessors).toBeUndefined();
		const outputProcessors = boltChannels.getOutputProcessors();
		expect(outputProcessors).toHaveLength(1);
		expect(outputProcessors[0]?.id).toBe("chat-channel-render");
	});

	it("always starts Bolt for mentions and DMs", () => {
		expect(shouldRunReplyGate(false, true)).toBe(false);
		expect(shouldRunReplyGate(true, false)).toBe(false);
	});

	it("gates unmentioned messages in subscribed threads", () => {
		expect(shouldRunReplyGate(false, false)).toBe(true);
	});

	it("defaults to not replying when the reply gate context cannot be fetched", async () => {
		const thread = {
			id: "slack:C123:456.789",
			adapter: { fetchMessages: () => Promise.reject(new Error("Slack unavailable")) },
		} as unknown as Thread;

		expect(await replyGateAllowsReply(thread, {} as Message)).toBe(false);
	});

	it("retains gate-negative messages without requiring a reply", async () => {
		const channels = createBoltChannels();
		const handler = channels.channelConfig.handlers?.onSubscribedMessage;
		if (typeof handler !== "function") throw new Error("Subscribed message handler is unavailable");

		const defaultHandler = vi.fn(() => Promise.resolve());
		const signalMetadata: Record<string, unknown> = {};
		const thread = {
			id: "slack:C123:456.789",
			adapter: { fetchMessages: () => Promise.reject(new Error("Slack unavailable")) },
		} as unknown as Thread;
		const message = { isMention: false } as Message;

		await handler(thread, message, defaultHandler, {
			requestContext: new RequestContext(),
			signalMetadata,
		});

		expect(defaultHandler).toHaveBeenCalledWith(thread, message);
		expect(signalMetadata).toEqual({ "bolt.replyExpected": false });
	});

	it("delivers gate-negative context to active runs and only persists it when idle", async () => {
		const channels = createBoltChannels();
		const accepted = Promise.resolve({ action: "persist" as const });
		const persisted = Promise.resolve();
		const sendMessage = vi.fn(() => ({ accepted, persisted }));
		const internals = channels as unknown as {
			dispatchInboundMessage(args: Record<string, unknown>): Promise<void>;
			getMastra(): { getAgentById(id: string): { sendMessage: typeof sendMessage } };
			getOwnerId(): string;
		};
		vi.spyOn(internals, "getMastra").mockReturnValue({ getAgentById: () => ({ sendMessage }) });
		vi.spyOn(internals, "getOwnerId").mockReturnValue("bolt");
		const requestContext = new RequestContext();

		await internals.dispatchInboundMessage({
			signalContents: "I know how",
			attributes: { authorName: "Simon" },
			signalMetadata: { "bolt.replyExpected": false },
			providerOptions: {},
			requestContext,
			thread: {},
			memory: { resource: "slack:thread", thread: "slack:thread" },
			autoResumeSuspendedTools: undefined,
		});

		expect(sendMessage).toHaveBeenCalledWith(
			{
				contents: "I know how",
				attributes: { authorName: "Simon" },
				metadata: { "bolt.replyExpected": false },
				providerOptions: {},
			},
			{
				resourceId: "slack:thread",
				threadId: "slack:thread",
				ifActive: { behavior: "deliver", attributes: { replyExpected: false } },
				ifIdle: {
					behavior: "persist",
					attributes: { replyExpected: false },
					streamOptions: { requestContext },
				},
			},
		);
	});

	it("dispatches reply turns through the registered durable agent", async () => {
		const channels = createBoltChannels();
		const consumeStream = vi.fn(() => Promise.resolve());
		const sendMessage = vi.fn(() => ({
			accepted: Promise.resolve({ action: "wake" as const, output: { output: { consumeStream } } }),
		}));
		const internals = channels as unknown as {
			dispatchInboundMessage(args: Record<string, unknown>): Promise<void>;
			getMastra(): { getAgentById(id: string): { sendMessage: typeof sendMessage } };
			getOwnerId(): string;
		};
		vi.spyOn(internals, "getMastra").mockReturnValue({ getAgentById: () => ({ sendMessage }) });
		vi.spyOn(internals, "getOwnerId").mockReturnValue("bolt");
		const requestContext = new RequestContext();

		await internals.dispatchInboundMessage({
			signalContents: "Keep going",
			attributes: { authorName: "Jonah" },
			signalMetadata: {},
			providerOptions: {},
			requestContext,
			thread: {},
			memory: { resource: "slack:thread", thread: "slack:thread" },
			autoResumeSuspendedTools: true,
		});

		expect(sendMessage).toHaveBeenCalledWith(
			{
				contents: "Keep going",
				attributes: { authorName: "Jonah" },
				providerOptions: {},
			},
			{
				resourceId: "slack:thread",
				threadId: "slack:thread",
				ifIdle: {
					behavior: "wake",
					streamOptions: {
						requestContext,
						memory: { resource: "slack:thread", thread: "slack:thread" },
						autoResumeSuspendedTools: true,
					},
				},
			},
		);
		expect(consumeStream).toHaveBeenCalledOnce();
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

	it("renders each normal-turn text delta exactly once", async () => {
		const channels = new AgentChannels({ adapters: {} });
		const outputProcessor = channels.getOutputProcessors()[0];
		if (outputProcessor?.processOutputStream === undefined) throw new Error("Channel renderer is unavailable");
		const harness = createRenderHarness(outputProcessor);

		await harness.process({
			type: "tool-call",
			payload: { toolCallId: "tool-1", toolName: "test_tool", args: {} },
		});
		await harness.process({
			type: "step-finish",
			payload: { stepResult: { isContinued: true, reason: "tool-calls" } },
		});
		await harness.process({ type: "text-delta", payload: { text: '"Repeat' } });
		await harness.process({ type: "text-delta", payload: { text: " 5 words" } });
		await harness.process({ type: "text-delta", payload: { text: ' from thread" scheduled' } });
		await harness.process({ type: "text-delta", payload: { text: " to run in this" } });
		await harness.process({ type: "text-delta", payload: { text: " thread in about 1 minute." } });
		await harness.process({
			type: "step-finish",
			payload: { stepResult: { reason: "stop" } },
		});
		await harness.process({ type: "finish", payload: { finishReason: "stop" } });

		expect(harness.streamEnded).toHaveBeenCalledOnce();
		expect(harness.postMessage).toHaveBeenCalledOnce();
		expect(harness.postMessage).toHaveBeenCalledWith("slack:C123:456.789", "...");
		expect(harness.editMessage).toHaveBeenCalledOnce();
		expect(harness.editMessage).toHaveBeenCalledWith("slack:C123:456.789", "message-1", {
			markdown: '"Repeat 5 words from thread" scheduled to run in this thread in about 1 minute.',
		});
	});

	it("flushes a durable reply when the stream ends without a terminal step", async () => {
		const channels = createBoltChannels();
		const outputProcessor = channels.getOutputProcessors()[0];
		if (outputProcessor?.processOutputStream === undefined) throw new Error("Channel renderer is unavailable");
		const harness = createRenderHarness(outputProcessor);

		await harness.process({ type: "text-delta", payload: { text: "labore sint" } });
		await harness.process({ type: "text-delta", payload: { text: " ea mollit ipsum" } });
		await harness.process({ type: "finish", payload: { finishReason: "stop" } });

		expect(harness.streamEnded).toHaveBeenCalledOnce();
		expect(harness.postMessage).toHaveBeenCalledOnce();
		expect(harness.editMessage).toHaveBeenCalledOnce();
		expect(harness.editMessage).toHaveBeenCalledWith("slack:C123:456.789", "message-1", {
			markdown: "labore sint ea mollit ipsum",
		});
	});
});

function createRenderHarness(outputProcessor: OutputProcessor) {
	const streamEnded = vi.fn();
	const postMessage = vi.fn().mockResolvedValue({ id: "message-1", threadId: "slack:C123:456.789" });
	const editMessage = vi.fn(() => Promise.resolve());
	const adapter = {
		name: "slack",
		postMessage,
		editMessage,
		stream: vi.fn().mockResolvedValue(null),
	} as unknown as Adapter;
	const chatThread = new ThreadImpl({
		adapter,
		channelId: "slack:C123",
		id: "slack:C123:456.789",
		stateAdapter: {} as StateAdapter,
	});
	const renderContext = {
		adapter,
		chatThread,
		platform: "slack",
		streaming: { enabled: true },
		toolDisplay: "grouped" as const,
		channelToolNames: new Set<string>(),
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
	};
	const requestContext = new RequestContext();
	requestContext.set(CHAT_CHANNEL_RENDER_CONTEXT_KEY, renderContext);
	const state = {};
	const process = (part: unknown) =>
		outputProcessor.processOutputStream?.({
			part: part as never,
			streamParts: [part] as never,
			state,
			requestContext,
			retryCount: 0,
			abort: (reason?: string): never => {
				throw new Error(reason);
			},
		});

	return { editMessage, postMessage, process, renderContext, requestContext, streamEnded };
}
