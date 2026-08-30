import type { AgentMessageInput, AgentSignalContents } from "@mastra/core/agent";
import { AgentChannels, type ChannelHandler } from "@mastra/core/channels";
import type { StorageThreadType } from "@mastra/core/memory";
import type { RequestContext } from "@mastra/core/request-context";
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

const THREAD_CONTEXT_MESSAGE_LIMIT = 10;
const REPLY_EXPECTED_METADATA_KEY = "bolt.replyExpected";

type MessageProviderOptions = NonNullable<Extract<AgentMessageInput, { contents: unknown }>["providerOptions"]>;

interface DispatchInboundMessageArgs {
	signalContents: AgentSignalContents;
	attributes: Record<string, string | undefined>;
	signalMetadata: Record<string, unknown>;
	providerOptions: MessageProviderOptions;
	requestContext: RequestContext;
	thread: StorageThreadType;
	memory: { thread: string; resource: string };
	autoResumeSuspendedTools: true | undefined;
}

class BoltAgentChannels extends AgentChannels {
	protected override async dispatchInboundMessage(args: DispatchInboundMessageArgs): Promise<void> {
		const mastra = this.getMastra();
		const ownerId = this.getOwnerId();
		try {
			if (mastra === undefined || ownerId === null) throw new Error("Bolt's Slack channels are not bound to an agent.");
			// AgentChannels is constructed with the underlying agent before Mastra wraps
			// it for durability. Resolve the registered owner so turns use the wrapper.
			const agent = mastra.getAgentById(ownerId);

			if (args.signalMetadata[REPLY_EXPECTED_METADATA_KEY] !== false) {
				const result = agent.sendMessage(
					{
						contents: args.signalContents,
						attributes: args.attributes,
						...(Object.keys(args.signalMetadata).length > 0 ? { metadata: args.signalMetadata } : {}),
						providerOptions: args.providerOptions,
					},
					{
						resourceId: args.memory.resource,
						threadId: args.memory.thread,
						ifIdle: {
							behavior: "wake",
							streamOptions: {
								requestContext: args.requestContext,
								memory: args.memory,
								autoResumeSuspendedTools: args.autoResumeSuspendedTools,
							},
						},
					},
				);
				const accepted = await result.accepted;
				if (accepted.action === "wake") {
					await consumeDurableAgentStream(accepted.output);
				}
				return;
			}

			const result = agent.sendMessage(
				{
					contents: args.signalContents,
					attributes: args.attributes,
					metadata: args.signalMetadata,
					providerOptions: args.providerOptions,
				},
				{
					resourceId: args.memory.resource,
					threadId: args.memory.thread,
					ifActive: { behavior: "deliver", attributes: { replyExpected: false } },
					ifIdle: {
						behavior: "persist",
						attributes: { replyExpected: false },
						streamOptions: { requestContext: args.requestContext },
					},
				},
			);
			await result.accepted;
			await result.persisted;
		} catch (error) {
			reportError(error, "Failed to retain a Slack message that did not require a reply", {
				threadId: args.memory.thread,
			});
		}
	}
}

async function consumeDurableAgentStream(result: unknown): Promise<void> {
	if (typeof result !== "object" || result === null || !("output" in result)) {
		throw new TypeError("Durable agent did not return a stream result.");
	}
	const { output } = result;
	if (typeof output !== "object" || output === null || !("consumeStream" in output)) {
		throw new TypeError("Durable agent stream result did not include consumable output.");
	}
	const { consumeStream } = output;
	if (typeof consumeStream !== "function") {
		throw new TypeError("Durable agent output is not consumable.");
	}
	await consumeStream.call(output);
}

export function createBoltChannels(): AgentChannels {
	return new BoltAgentChannels({
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
	});
}

export const boltChannels = createBoltChannels();

function createHandler(options: { includeThreadContext: boolean; runReplyGate: boolean }): ChannelHandler {
	return async (thread, message, defaultHandler, context) => {
		if (options.runReplyGate && message.isMention !== true && !(await replyGateAllowsReply(thread, message))) {
			context.signalMetadata[REPLY_EXPECTED_METADATA_KEY] = false;
			await defaultHandler(thread, message);
			return;
		}

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
		reportError(error, "Slack reply gate failed; defaulting to no reply", { threadId: thread.id });
		return false;
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
