import type { Mastra } from "@mastra/core/mastra";
import { RequestContext } from "@mastra/core/request-context";
import type { Chat } from "chat";
import { describe, expect, it, vi } from "vite-plus/test";
import type { ScheduledTaskInput } from "../scheduled-tasks.ts";
import {
	attachChannelRenderContext,
	deleteOneOffScheduleOnFinish,
	prepareRecurringDispatchTarget,
	queueAndWaitForBoltTurn,
	registerRecurringTarget,
} from "./run-scheduled-task.ts";

const recurringTask: Extract<ScheduledTaskInput, { kind: "recurring" }> = {
	scheduleId: "schedule_weekly",
	kind: "recurring",
	name: "Weekly code review",
	prompt: "Review open pull requests in team581/offseason-2026 and report correctness issues.",
	channelId: "slack:C123",
	sourceThreadId: "slack:C123:100.000",
	creatorUserId: "U123",
	createdAt: "2026-08-12T00:00:00.000Z",
	timezone: "America/Los_Angeles",
	cron: "0 9 * * 1",
};

describe("scheduled Slack routing", () => {
	it("creates one recurring root, subscribes it, and persists fresh channel-backed memory", async () => {
		const post = vi.fn(() => Promise.resolve({ threadId: "slack:C123:200.000" }));
		const subscribe = vi.fn(() => Promise.resolve());
		const chat = {
			channel: vi.fn(() => ({ post })),
			thread: vi.fn(() => ({ subscribe })),
		} as unknown as Chat;
		let storedThread: unknown;
		const saveThread = vi.fn(({ thread }: { thread: unknown }) => {
			storedThread = thread;
			return Promise.resolve(thread);
		});
		const memory = {
			getThreadById: vi.fn(() => Promise.resolve(storedThread ?? null)),
			saveThread,
		};
		const mastra = {
			getStorage: () => ({ getStore: () => Promise.resolve(memory) }),
		} as unknown as Mastra;

		let createdThreadId: string | undefined;
		const persistCreatedThreadId = vi.fn((threadId: string) => {
			createdThreadId = threadId;
			return Promise.resolve();
		});
		const target = await prepareRecurringDispatchTarget(chat, recurringTask, createdThreadId, persistCreatedThreadId);
		await prepareRecurringDispatchTarget(chat, recurringTask, createdThreadId, persistCreatedThreadId);
		expect(post).toHaveBeenCalledOnce();
		expect(persistCreatedThreadId).toHaveBeenCalledOnce();
		expect(post).toHaveBeenCalledWith("Scheduled run: Weekly code review");
		expect(target).toMatchObject({
			targetThreadId: "slack:C123:200.000",
			resourceId: "slack:slack:C123:200.000",
		});
		expect(target.resourceId).not.toBe(`slack:${recurringTask.sourceThreadId}`);

		await registerRecurringTarget(mastra, chat, target);
		await registerRecurringTarget(mastra, chat, target);
		expect(post).toHaveBeenCalledOnce();
		expect(subscribe).toHaveBeenCalledTimes(2);
		expect(saveThread).toHaveBeenCalledOnce();
		expect(storedThread).toMatchObject({
			id: "slack:slack:C123:200.000",
			resourceId: "slack:slack:C123:200.000",
			metadata: {
				channel_platform: "slack",
				channel_externalThreadId: "slack:C123:200.000",
				channel_externalChannelId: "slack:C123",
			},
		});
	});

	it("starts an idle scheduled turn with the selected memory thread and request context", async () => {
		const unsubscribe = vi.fn();
		const renderContext = { platform: "slack" };
		const buildRenderContextForThread = vi.fn(() => Promise.resolve(renderContext));
		const processOutputStream = vi.fn(() => Promise.resolve());
		const queueMessage = vi.fn(() => ({
			accepted: Promise.resolve({ action: "wake", runId: "run-1", output: {} }),
		}));
		const agent = {
			getChannels: () => ({
				buildRenderContextForThread,
				getOutputProcessors: () => [{ id: "chat-channel-render", processOutputStream }],
			}),
			subscribeToThread: () =>
				Promise.resolve({ stream: iterable([{ runId: "run-1", type: "finish", payload: {} }]), unsubscribe }),
			queueMessage,
		};
		const requestContext = new RequestContext();

		await queueAndWaitForBoltTurn(
			agent as unknown as Parameters<typeof queueAndWaitForBoltTurn>[0],
			"Perform the review.",
			"slack:slack:C123:200.000",
			requestContext,
		);

		expect(queueMessage).toHaveBeenCalledWith("Perform the review.", {
			resourceId: "slack:slack:C123:200.000",
			threadId: "slack:slack:C123:200.000",
			ifIdle: { behavior: "wake", streamOptions: { requestContext, abortSignal: undefined } },
		});
		expect(buildRenderContextForThread).toHaveBeenCalledWith("slack:slack:C123:200.000");
		expect(requestContext.get("__mastra_chat_channel_render")).toBe(renderContext);
		expect(processOutputStream).toHaveBeenCalledOnce();
		expect(unsubscribe).toHaveBeenCalledOnce();
	});

	it("waits for a queued turn behind active work and surfaces failures or cancellation", async () => {
		const completedAgent = queuedAgent([
			{ runId: "other-run", type: "finish", payload: {} },
			{ runId: "queued-run", type: "finish", payload: { finishReason: "tool-calls" } },
			{ runId: "queued-run", type: "finish", payload: {} },
		]);
		await expect(
			queueAndWaitForBoltTurn(
				completedAgent.agent as unknown as Parameters<typeof queueAndWaitForBoltTurn>[0],
				"Queued task",
				"thread",
				new RequestContext(),
			),
		).resolves.toBeUndefined();
		expect(completedAgent.unsubscribe).toHaveBeenCalledOnce();

		for (const type of ["error", "abort"] as const) {
			const failedAgent = queuedAgent([{ runId: "queued-run", type, payload: { reason: type } }]);
			await expect(
				queueAndWaitForBoltTurn(
					failedAgent.agent as unknown as Parameters<typeof queueAndWaitForBoltTurn>[0],
					"Queued task",
					"thread",
					new RequestContext(),
				),
			).rejects.toThrow(type === "error" ? "failed" : "canceled");
			expect(failedAgent.unsubscribe).toHaveBeenCalledOnce();
		}
	});

	it("deletes claimed one-offs while retaining recurring schedules", async () => {
		const deleteSchedule = vi.fn(() => Promise.resolve());
		const mastra = { schedules: { delete: deleteSchedule } } as unknown as Mastra;
		const oneOff: ScheduledTaskInput = {
			...recurringTask,
			kind: "one-off",
			runAt: "2026-08-13T16:00:00.000Z",
		};

		expect(await deleteOneOffScheduleOnFinish(mastra, oneOff)).toBe(true);
		expect(await deleteOneOffScheduleOnFinish(mastra, recurringTask)).toBe(false);
		expect(deleteSchedule).toHaveBeenCalledOnce();
		expect(deleteSchedule).toHaveBeenCalledWith("schedule_weekly");
	});

	it("fails before starting an agent turn when Slack render context cannot be reconstructed", async () => {
		const agent = {
			getChannels: () => ({ buildRenderContextForThread: () => Promise.resolve(null) }),
		} as unknown as Parameters<typeof attachChannelRenderContext>[0];
		await expect(attachChannelRenderContext(agent, "thread", new RequestContext())).rejects.toThrow(
			"Slack render context is unavailable",
		);
	});
});

function queuedAgent(chunks: unknown[]) {
	const unsubscribe = vi.fn();
	return {
		unsubscribe,
		agent: {
			getChannels: () => ({
				buildRenderContextForThread: () => Promise.resolve({ platform: "slack" }),
				getOutputProcessors: () => [{ id: "chat-channel-render", processOutputStream: () => Promise.resolve() }],
			}),
			subscribeToThread: () => Promise.resolve({ stream: iterable(chunks), unsubscribe }),
			queueMessage: () => ({ accepted: Promise.resolve({ action: "deliver", runId: "queued-run" }) }),
		},
	};
}

function iterable<T>(values: T[]): AsyncIterable<T> {
	return {
		[Symbol.asyncIterator]() {
			let index = 0;
			return {
				next: () =>
					Promise.resolve(
						index < values.length
							? { done: false as const, value: values[index++]! }
							: { done: true as const, value: undefined },
					),
			};
		},
	};
}
