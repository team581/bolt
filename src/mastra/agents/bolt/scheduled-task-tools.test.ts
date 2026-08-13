import { RequestContext } from "@mastra/core/request-context";
import type { Schedules, WorkflowSchedule } from "@mastra/core/schedules";
import { Cron } from "croner";
import { describe, expect, it } from "vite-plus/test";
import {
	createScheduledTask,
	deleteScheduledTask,
	listScheduledTasks,
	updateScheduledTask,
} from "./scheduled-task-tools.ts";

describe("scheduled task CRUD", () => {
	it("creates, lists, updates, and deletes channel-owned recurring tasks", async () => {
		const schedules = createScheduleStore();
		const creationContext = slackRequestContext("slack:C123", "slack:C123:100.000");
		const task = await createScheduledTask(
			{ schedules, requestContext: creationContext },
			{
				name: "Weekly code review",
				prompt: "Review all open pull requests in team581/offseason-2026 and report correctness issues.",
				cron: "0 9 * * 1",
			},
		);

		expect(task).toMatchObject({
			kind: "recurring",
			name: "Weekly code review",
			timezone: "America/Los_Angeles",
			cron: "0 9 * * 1",
		});
		const otherThread = slackRequestContext("slack:C123", "slack:C123:200.000");
		expect(await listScheduledTasks({ schedules, requestContext: otherThread })).toHaveLength(1);

		const updated = await updateScheduledTask(
			{ schedules, requestContext: otherThread },
			{
				id: task.id,
				name: "Monday review",
				cron: "0 10 * * 1",
				timezone: "America/New_York",
			},
		);
		expect(updated).toMatchObject({
			id: task.id,
			name: "Monday review",
			cron: "0 10 * * 1",
			timezone: "America/New_York",
		});
		expect(await deleteScheduledTask({ schedules, requestContext: otherThread }, task.id)).toEqual({
			deleted: true,
			id: task.id,
		});
		expect(await listScheduledTasks({ schedules, requestContext: creationContext })).toEqual([]);
	});

	it("keeps one-offs in their creation thread and rejects kind or cross-channel changes", async () => {
		const schedules = createScheduleStore();
		const creationContext = slackRequestContext("slack:C123", "slack:C123:100.000");
		const task = await createScheduledTask(
			{ schedules, requestContext: creationContext },
			{
				name: "Check CI",
				prompt: "Check CI for team581/offseason-2026 and summarize any failures.",
				runAt: "2090-08-13T09:00:00",
			},
		);

		expect(await listScheduledTasks({ schedules, requestContext: creationContext })).toHaveLength(1);
		expect(
			await listScheduledTasks({
				schedules,
				requestContext: slackRequestContext("slack:C123", "slack:C123:200.000"),
			}),
		).toEqual([]);
		await expect(
			updateScheduledTask({ schedules, requestContext: creationContext }, { id: task.id, cron: "0 9 * * 1" }),
		).rejects.toThrow("immutable");
		await expect(
			deleteScheduledTask(
				{ schedules, requestContext: slackRequestContext("slack:C999", "slack:C999:100.000") },
				task.id,
			),
		).rejects.toThrow("different Slack conversation");
	});
});

function slackRequestContext(channelId: string, threadId: string): RequestContext {
	return new RequestContext([
		[
			"channel",
			{
				platform: "slack",
				eventType: "mention",
				channelId,
				threadId,
				userId: "U123",
			},
		],
	]);
}

function createScheduleStore(): Schedules {
	const rows = new Map<string, WorkflowSchedule>();
	return {
		create(input) {
			if (!("workflowId" in input)) throw new Error("Expected workflow schedule.");
			const now = Date.now();
			const id = input.id ?? "schedule_test";
			const row: WorkflowSchedule = {
				id,
				workflowId: input.workflowId,
				cron: input.cron,
				timezone: input.timezone,
				status: input.status ?? "active",
				nextFireAt: new Cron(input.cron, { timezone: input.timezone }).nextRun()?.getTime() ?? 0,
				inputData: input.inputData,
				metadata: input.metadata,
				createdAt: now,
				updatedAt: now,
			};
			rows.set(id, row);
			return Promise.resolve(row);
		},
		get: (id) => Promise.resolve(rows.get(id) ?? null),
		list: ({ workflowId } = {}) =>
			Promise.resolve([...rows.values()].filter((row) => workflowId === undefined || row.workflowId === workflowId)),
		update(id, patch) {
			const row = rows.get(id);
			if (row === undefined) throw new Error("not found");
			if (!("inputData" in patch || "cron" in patch || "timezone" in patch))
				throw new Error("Expected workflow patch.");
			const updated: WorkflowSchedule = {
				...row,
				...patch,
				nextFireAt:
					new Cron(patch.cron ?? row.cron, { timezone: patch.timezone ?? row.timezone }).nextRun()?.getTime() ?? 0,
				updatedAt: Date.now(),
			};
			rows.set(id, updated);
			return Promise.resolve(updated);
		},
		delete: (id) => {
			rows.delete(id);
			return Promise.resolve();
		},
	} as Schedules;
}
