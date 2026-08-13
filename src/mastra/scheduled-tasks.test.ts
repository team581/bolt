import type { WorkflowSchedule } from "@mastra/core/schedules";
import { describe, expect, it } from "vite-plus/test";
import {
	canManageScheduledTask,
	createScheduledTaskToolInputSchema,
	isMissedScheduledFire,
	normalizeOneOffTime,
	oneOffCron,
	parseScheduledFireAt,
	type ScheduledTaskInput,
	toScheduledTaskRecord,
	updateScheduledTaskToolInputSchema,
	validateRecurringCron,
} from "./scheduled-tasks.ts";

const recurringTask: ScheduledTaskInput = {
	scheduleId: "schedule_weekly",
	kind: "recurring",
	name: "Weekly review",
	prompt: "Review the open pull requests in team581/offseason-2026 and summarize actionable findings.",
	channelId: "slack:C123",
	sourceThreadId: "slack:C123:100.000",
	creatorUserId: "U123",
	createdAt: "2026-08-12T00:00:00.000Z",
	timezone: "America/Los_Angeles",
	cron: "0 9 * * 1",
};

describe("scheduled task timing", () => {
	it("validates the flat tool timing schemas", () => {
		const common = { name: "Review", prompt: "Review the open pull requests and summarize findings." };
		expect(createScheduledTaskToolInputSchema.safeParse({ ...common, cron: "0 9 * * 1" }).success).toBe(true);
		expect(createScheduledTaskToolInputSchema.safeParse({ ...common }).success).toBe(false);
		expect(
			createScheduledTaskToolInputSchema.safeParse({ ...common, runAt: "2090-08-13T09:00:00", cron: "0 9 * * 1" })
				.success,
		).toBe(false);
		expect(updateScheduledTaskToolInputSchema.safeParse({ id: "schedule_1", name: "New name" }).success).toBe(true);
		expect(
			updateScheduledTaskToolInputSchema.safeParse({ id: "schedule_1", timezone: "America/New_York" }).success,
		).toBe(false);
		expect(
			updateScheduledTaskToolInputSchema.safeParse({ id: "schedule_1", runAt: "2090-08-13", cron: "0 9 * * 1" })
				.success,
		).toBe(false);
	});

	it("interprets unspecified local times in the selected IANA timezone", () => {
		const runAt = normalizeOneOffTime("2026-08-13T09:00:00", "America/Los_Angeles", new Date("2026-08-12T00:00:00Z"));
		expect(runAt.toISOString()).toBe("2026-08-13T16:00:00.000Z");
		expect(oneOffCron(runAt)).toBe("0 0 16 13 8 * 2026,9999");
	});

	it("validates recurring cron expressions and timezones", () => {
		expect(validateRecurringCron("0 9 * * 1", "America/Los_Angeles")).toBe("0 9 * * 1");
		expect(() => validateRecurringCron("every Monday", "America/Los_Angeles")).toThrow("5-, 6-, or 7-part");
		expect(() => validateRecurringCron("0 9 * * 1", "Mars/Olympus_Mons")).toThrow("Invalid recurring cron");
	});

	it("extracts the fire time and skips only occurrences over 60 seconds late", () => {
		const runId = "sched_schedule_weekly_1786579200000";
		expect(parseScheduledFireAt(runId)).toBe(1_786_579_200_000);
		expect(isMissedScheduledFire(runId, 1_786_579_260_000)).toBe(false);
		expect(isMissedScheduledFire(runId, 1_786_579_260_001)).toBe(true);
		expect(isMissedScheduledFire("manual-run", 1_786_579_999_999)).toBe(false);
	});
});

describe("scheduled task ownership", () => {
	it("scopes one-offs to their source thread and recurring tasks to their channel", () => {
		const oneOff: ScheduledTaskInput = {
			...recurringTask,
			kind: "one-off",
			runAt: "2026-08-13T16:00:00.000Z",
		};
		expect(canManageScheduledTask(oneOff, { channelId: "slack:C123", threadId: "slack:C123:100.000" })).toBe(true);
		expect(canManageScheduledTask(oneOff, { channelId: "slack:C123", threadId: "slack:C123:200.000" })).toBe(false);
		expect(canManageScheduledTask(recurringTask, { channelId: "slack:C123", threadId: "slack:C123:200.000" })).toBe(
			true,
		);
		expect(canManageScheduledTask(recurringTask, { channelId: "slack:C999", threadId: "slack:C999:200.000" })).toBe(
			false,
		);
	});

	it("projects persisted schedule timing and run history", () => {
		const schedule: WorkflowSchedule = {
			id: recurringTask.scheduleId,
			workflowId: "run-scheduled-task",
			cron: recurringTask.cron,
			timezone: recurringTask.timezone,
			status: "active",
			nextFireAt: Date.parse("2026-08-17T16:00:00Z"),
			lastFireAt: Date.parse("2026-08-10T16:00:00Z"),
			inputData: recurringTask,
			createdAt: Date.parse(recurringTask.createdAt),
			updatedAt: Date.parse(recurringTask.createdAt),
		};
		expect(toScheduledTaskRecord(schedule)).toMatchObject({
			id: "schedule_weekly",
			kind: "recurring",
			cron: "0 9 * * 1",
			nextRunAt: "2026-08-17T16:00:00.000Z",
			lastRunAt: "2026-08-10T16:00:00.000Z",
		});
	});
});
