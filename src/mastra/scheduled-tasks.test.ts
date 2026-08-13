import { RequestContext } from "@mastra/core/request-context";
import type { WorkflowSchedule } from "@mastra/core/schedules";
import { describe, expect, it } from "vite-plus/test";
import {
	canManageScheduledTask,
	isMissedScheduledFire,
	oneOffCron,
	parseScheduledFireAt,
	requireSlackContext,
	resolveOneOffTime,
	type ScheduledTaskInput,
	toScheduledTaskRecord,
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
	it("interprets formal local times in the selected IANA timezone", () => {
		const { runAt, timezone } = resolveOneOffTime("2026-08-13T09:00:00", Temporal.Instant.from("2026-08-12T00:00:00Z"));
		expect(runAt.toString()).toBe("2026-08-13T16:00:00Z");
		expect(timezone).toBe("America/Los_Angeles");
		expect(oneOffCron(runAt)).toBe("0 0 16 13 8 * 2026,9999");
	});

	it("interprets natural-language times relative to now", () => {
		const now = Temporal.Instant.from("2026-08-12T23:00:00Z");
		expect(resolveOneOffTime("today at 5pm", now).runAt.toString()).toBe("2026-08-13T00:00:00Z");
		expect(resolveOneOffTime("at 3pm", now).runAt.toString()).toBe("2026-08-13T22:00:00Z");
		expect(resolveOneOffTime("next week", now).runAt.toString()).toBe("2026-08-19T23:00:00Z");
	});

	it("preserves calendar time across daylight saving changes", () => {
		const now = Temporal.Instant.from("2026-10-31T19:00:00Z");
		expect(resolveOneOffTime("in a week", now).runAt.toString()).toBe("2026-11-07T20:00:00Z");
		expect(resolveOneOffTime("in 24 hours", now).runAt.toString()).toBe("2026-11-01T19:00:00Z");
	});

	it("accepts embedded offsets and abbreviations", () => {
		const now = Temporal.Instant.from("2026-08-12T20:00:00Z");
		const iso = resolveOneOffTime("2026-08-13T17:00:00-04:00", now);
		expect(iso.runAt.toString()).toBe("2026-08-13T21:00:00Z");
		expect(iso.timezone).toBe("-04:00");
		const abbreviation = resolveOneOffTime("tomorrow at 5pm PDT", now);
		expect(abbreviation.runAt.toString()).toBe("2026-08-14T00:00:00Z");
		expect(abbreviation.timezone).toBe("-07:00");
	});

	it("rejects recurring, partially parsed, and ambiguous local times", () => {
		const now = Temporal.Instant.from("2026-08-12T00:00:00Z");
		expect(() => resolveOneOffTime("every Monday at 5pm", now)).toThrow("Invalid or ambiguous one-off time");
		expect(() => resolveOneOffTime("remind me tomorrow", now)).toThrow("Invalid or ambiguous one-off time");
		expect(() => resolveOneOffTime("November 1, 2026 at 1:30am", now)).toThrow("Invalid or ambiguous one-off time");
		expect(() => resolveOneOffTime("tomorrow at 5pm America/Los_Angeles", now)).toThrow(
			"Invalid or ambiguous one-off time",
		);
	});

	it("validates recurring cron expressions and timezones", () => {
		expect(validateRecurringCron("0 9 * * 1", "America/Los_Angeles")).toBe("0 9 * * 1");
		expect(() => validateRecurringCron("every Monday", "America/Los_Angeles")).toThrow("5-, 6-, or 7-part");
		expect(() => validateRecurringCron("0 9 * * 1", "Mars/Olympus_Mons")).toThrow("Invalid recurring cron");
	});

	it("extracts the fire time and skips only occurrences over 60 seconds late", () => {
		const runId = "sched_schedule_weekly_1786579200000";
		expect(parseScheduledFireAt(runId)?.epochMilliseconds).toBe(1_786_579_200_000);
		expect(isMissedScheduledFire(runId, Temporal.Instant.fromEpochMilliseconds(1_786_579_260_000))).toBe(false);
		expect(isMissedScheduledFire(runId, Temporal.Instant.fromEpochMilliseconds(1_786_579_260_001))).toBe(true);
		expect(isMissedScheduledFire("manual-run", Temporal.Instant.fromEpochMilliseconds(1_786_579_999_999))).toBe(false);
	});
});

describe("scheduled task ownership", () => {
	it("requires a Slack user before creating an owned task", () => {
		const requestContext = new RequestContext();
		requestContext.set("channel", {
			platform: "slack",
			channelId: "slack:C123",
			threadId: "slack:C123:100.000",
		});
		expect(() => requireSlackContext(requestContext)).toThrow(
			"Scheduled tasks can only be managed from a Slack thread.",
		);
	});

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
			nextFireAt: Temporal.Instant.from("2026-08-17T16:00:00Z").epochMilliseconds,
			lastFireAt: Temporal.Instant.from("2026-08-10T16:00:00Z").epochMilliseconds,
			inputData: recurringTask,
			createdAt: Temporal.Instant.from(recurringTask.createdAt).epochMilliseconds,
			updatedAt: Temporal.Instant.from(recurringTask.createdAt).epochMilliseconds,
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
