import type { Mastra } from "@mastra/core/mastra";
import { RequestContext } from "@mastra/core/request-context";
import type { ChunkType } from "@mastra/core/stream";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import type { Chat } from "chat";
import { z } from "zod";
import { reportError } from "../../sentry.ts";
import {
	isMissedScheduledFire,
	RUN_SCHEDULED_TASK_WORKFLOW_ID,
	scheduledTaskInputSchema,
	type ScheduledTaskInput,
} from "../scheduled-tasks.ts";
import { slackConversationId, withBoltSandboxContext } from "../agents/bolt/sandbox.ts";

type RuntimeAgent = Awaited<ReturnType<Mastra["getAgentById"]>>;
const CHAT_CHANNEL_RENDER_CONTEXT_KEY = "__mastra_chat_channel_render";

const dispatchTargetSchema = scheduledTaskInputSchema.and(
	z.object({
		skipped: z.boolean(),
		targetThreadId: z.string(),
		resourceId: z.string(),
	}),
);

const workflowOutputSchema = z.object({
	status: z.enum(["completed", "skipped"]),
	threadId: z.string(),
});

const workflowStateSchema = z.object({ createdThreadId: z.string().optional() });

export type ScheduledDispatchTarget = z.infer<typeof dispatchTargetSchema>;

const prepareTarget = createStep({
	id: "prepare-slack-target",
	inputSchema: scheduledTaskInputSchema,
	outputSchema: dispatchTargetSchema,
	stateSchema: workflowStateSchema,
	retries: 3,
	execute: (context) => {
		const { inputData, runId, mastra, state } = context;
		if (isMissedScheduledFire(runId)) {
			return Promise.resolve({
				...inputData,
				skipped: true,
				targetThreadId: inputData.sourceThreadId,
				resourceId: slackConversationId(inputData.sourceThreadId),
			});
		}
		if (inputData.kind === "one-off") {
			return Promise.resolve({
				...inputData,
				skipped: false,
				targetThreadId: inputData.sourceThreadId,
				resourceId: slackConversationId(inputData.sourceThreadId),
			});
		}

		const { chat } = getBoltChannelRuntime(mastra);
		return prepareRecurringDispatchTarget(chat, inputData, state.createdThreadId, async (createdThreadId) => {
			await context.setState({ createdThreadId });
		});
	},
});

const registerTarget = createStep({
	id: "register-slack-target",
	inputSchema: dispatchTargetSchema,
	outputSchema: dispatchTargetSchema,
	retries: 3,
	execute: async ({ inputData, mastra }) => {
		if (inputData.skipped || inputData.kind === "one-off") return inputData;
		const { chat } = getBoltChannelRuntime(mastra);
		await registerRecurringTarget(mastra, chat, inputData);
		return inputData;
	},
});

const dispatchTurn = createStep({
	id: "dispatch-bolt-turn",
	inputSchema: dispatchTargetSchema,
	outputSchema: workflowOutputSchema,
	retries: 3,
	execute: async ({ inputData, mastra, abortSignal }) => {
		if (inputData.skipped) return { status: "skipped" as const, threadId: inputData.targetThreadId };
		const { agent } = getBoltChannelRuntime(mastra);
		const requestContext = new RequestContext();
		await withBoltSandboxContext({
			threadId: inputData.targetThreadId,
			requestContext,
			run: () => queueAndWaitForBoltTurn(agent, inputData.prompt, inputData.resourceId, requestContext, abortSignal),
		});
		return { status: "completed" as const, threadId: inputData.targetThreadId };
	},
});

// oxlint-disable-next-line unicorn/prefer-top-level-await -- This is Mastra's fluent workflow builder, not a Promise.
const runScheduledTask = createWorkflow({
	id: RUN_SCHEDULED_TASK_WORKFLOW_ID,
	inputSchema: scheduledTaskInputSchema,
	outputSchema: workflowOutputSchema,
	stateSchema: workflowStateSchema,
	options: {
		onError: ({ error, getInitData, runId }) => {
			const task = scheduledTaskInputSchema.safeParse(getInitData());
			reportError(error, "Scheduled task dispatch failed", {
				runId,
				...(task.success ? { scheduleId: task.data.scheduleId, taskKind: task.data.kind } : {}),
			});
		},
		onFinish: async ({ getInitData, mastra, runId }) => {
			const task = scheduledTaskInputSchema.safeParse(getInitData());
			if (!task.success || mastra === undefined) return;
			try {
				await deleteOneOffScheduleOnFinish(mastra, task.data);
			} catch (error) {
				reportError(error, "Failed to delete completed one-off scheduled task", {
					runId,
					scheduleId: task.data.scheduleId,
				});
			}
		},
	},
})
	.then(prepareTarget)
	.then(registerTarget)
	.then(dispatchTurn)
	.commit();

export default runScheduledTask;

export async function deleteOneOffScheduleOnFinish(mastra: Mastra, task: ScheduledTaskInput): Promise<boolean> {
	if (task.kind !== "one-off") return false;
	await mastra.schedules.delete(task.scheduleId);
	return true;
}

export async function prepareRecurringDispatchTarget(
	chat: Chat,
	task: Extract<ScheduledTaskInput, { kind: "recurring" }>,
	createdThreadId: string | undefined,
	persistCreatedThreadId: (threadId: string) => Promise<void>,
): Promise<ScheduledDispatchTarget> {
	const targetThreadId =
		createdThreadId ?? (await chat.channel(task.channelId).post(`Scheduled run: ${task.name}`)).threadId;
	if (createdThreadId === undefined) await persistCreatedThreadId(targetThreadId);
	return {
		...task,
		skipped: false,
		targetThreadId,
		resourceId: slackConversationId(targetThreadId),
	};
}

export async function registerRecurringTarget(
	mastra: Mastra,
	chat: Chat,
	target: ScheduledDispatchTarget,
): Promise<void> {
	await chat.thread(target.targetThreadId).subscribe();
	await saveChannelMemoryThread(mastra, target);
}

export async function saveChannelMemoryThread(mastra: Mastra, target: ScheduledDispatchTarget): Promise<void> {
	const memory = await mastra.getStorage()?.getStore("memory");
	if (memory === undefined) throw new Error("Mastra memory storage is unavailable.");
	const existing = await memory.getThreadById({ threadId: target.resourceId, resourceId: target.resourceId });
	if (existing !== null) return;
	const now = new Date(Temporal.Now.instant().epochMilliseconds);
	await memory.saveThread({
		thread: {
			id: target.resourceId,
			resourceId: target.resourceId,
			title: `Scheduled run: ${target.name}`,
			createdAt: now,
			updatedAt: now,
			metadata: {
				channel_platform: "slack",
				channel_externalThreadId: target.targetThreadId,
				channel_externalChannelId: target.channelId,
			},
		},
	});
}

export async function queueAndWaitForBoltTurn(
	agent: RuntimeAgent,
	prompt: string,
	resourceId: string,
	requestContext: RequestContext,
	abortSignal?: AbortSignal,
): Promise<void> {
	await attachChannelRenderContext(agent, resourceId, requestContext);
	const renderChunk = getScheduledChannelRenderer(agent, requestContext, abortSignal);
	const renderState: Record<string, unknown> = {};
	const streamParts: ChunkType[] = [];
	const subscription = await agent.subscribeToThread({ resourceId, threadId: resourceId });
	try {
		const queued = agent.queueMessage(prompt, {
			resourceId,
			threadId: resourceId,
			ifIdle: { behavior: "wake", streamOptions: { requestContext, abortSignal } },
		});
		const accepted = await queued.accepted;
		if (accepted.action !== "wake" && accepted.action !== "deliver")
			throw new Error(`Scheduled turn was not queued: ${accepted.action}.`);

		for await (const chunk of subscription.stream) {
			if (chunk.runId !== accepted.runId) continue;
			streamParts.push(chunk);
			await renderChunk(chunk, streamParts, renderState);
			if (chunk.type === "error") throw new Error("The queued scheduled turn failed.", { cause: chunk.payload });
			if (chunk.type === "abort") throw new Error("The queued scheduled turn was canceled.", { cause: chunk.payload });
			if (chunk.type === "finish" && chunk.payload.finishReason !== "tool-calls") return;
		}
		throw new Error("The queued scheduled turn ended without a terminal event.");
	} finally {
		subscription.unsubscribe();
	}
}

function getScheduledChannelRenderer(
	agent: RuntimeAgent,
	requestContext: RequestContext,
	abortSignal?: AbortSignal,
): (part: ChunkType, streamParts: ChunkType[], state: Record<string, unknown>) => Promise<void> {
	const renderer = agent
		.getChannels()
		?.getOutputProcessors()
		.find((processor) => processor.id === "chat-channel-render" && processor.processOutputStream !== undefined);
	const render = renderer?.processOutputStream?.bind(renderer);
	if (render === undefined) throw new Error("Bolt's Slack output renderer is unavailable.");

	return async (part, streamParts, state) => {
		await render({
			part,
			streamParts,
			state,
			requestContext,
			agent,
			abortSignal,
			retryCount: 0,
			abort: (reason?: string) => {
				throw new Error(reason ?? "Slack output rendering was aborted.");
			},
		});
	};
}

export async function attachChannelRenderContext(
	agent: RuntimeAgent,
	threadId: string,
	requestContext: RequestContext,
): Promise<void> {
	const channels = agent.getChannels();
	if (channels === null) throw new Error("Bolt's channel runtime is unavailable.");
	const renderContext = await channels.buildRenderContextForThread(threadId);
	if (renderContext === null) throw new Error(`Slack render context is unavailable for Mastra thread ${threadId}.`);
	requestContext.set(CHAT_CHANNEL_RENDER_CONTEXT_KEY, renderContext);
}

function getBoltChannelRuntime(mastra: Mastra | undefined): {
	agent: RuntimeAgent;
	chat: Chat;
} {
	if (mastra === undefined) throw new Error("Mastra is unavailable.");
	const agent = mastra.getAgentById("bolt");
	const chat = agent.getChannels()?.sdk;
	if (chat === null || chat === undefined) throw new Error("Bolt's Slack channel runtime is unavailable.");
	return { agent, chat };
}
