import type { ChannelContext } from "@mastra/core/channels";
import type { RequestContext } from "@mastra/core/request-context";
import type { WorkflowSchedule } from "@mastra/core/schedules";
import { Cron } from "croner";
import { z } from "zod";

export const RUN_SCHEDULED_TASK_WORKFLOW_ID = "run-scheduled-task";
export const DEFAULT_SCHEDULE_TIMEZONE = "America/Los_Angeles";
export const SCHEDULE_GRACE_PERIOD_MS = 60_000;

const commonTaskInputSchema = z.object({
	scheduleId: z.string(),
	name: z.string().min(1),
	prompt: z.string().min(1),
	channelId: z.string(),
	sourceThreadId: z.string(),
	creatorUserId: z.string(),
	createdAt: z.string(),
	timezone: z.string(),
});

export const scheduledTaskInputSchema = z.discriminatedUnion("kind", [
	commonTaskInputSchema.extend({ kind: z.literal("one-off"), runAt: z.string() }),
	commonTaskInputSchema.extend({ kind: z.literal("recurring"), cron: z.string() }),
]);

export type ScheduledTaskInput = z.infer<typeof scheduledTaskInputSchema>;

export const scheduledTaskRecordSchema = z.object({
	id: z.string(),
	kind: z.enum(["one-off", "recurring"]),
	name: z.string(),
	prompt: z.string(),
	status: z.enum(["active", "paused"]),
	runAt: z.string().optional(),
	cron: z.string().optional(),
	timezone: z.string(),
	nextRunAt: z.string(),
	lastRunAt: z.string().optional(),
});

export type ScheduledTaskRecord = z.infer<typeof scheduledTaskRecordSchema>;

export function requireSlackContext(
	requestContext: RequestContext | undefined,
): Required<Pick<ChannelContext, "channelId" | "threadId" | "userId">> {
	const channel = requestContext?.get<"channel", ChannelContext | undefined>("channel");
	if (channel?.platform !== "slack" || channel.channelId === undefined || channel.threadId === undefined) {
		throw new Error("Scheduled tasks can only be managed from a Slack thread.");
	}
	return { channelId: channel.channelId, threadId: channel.threadId, userId: channel.userId };
}

export function normalizeOneOffTime(runAt: string, timezone = DEFAULT_SCHEDULE_TIMEZONE, now = new Date()): Date {
	let next: Date | null;
	try {
		next = new Cron(runAt, { timezone }).nextRun(new Date(0));
	} catch (error) {
		throw new Error(`Invalid one-off date or timezone: ${runAt} (${timezone}).`, { cause: error });
	}
	if (next === null || next.getTime() <= now.getTime())
		throw new Error("A one-off task must be scheduled in the future.");
	if (next.getUTCFullYear() >= 9999) throw new Error("A one-off task must be scheduled before the year 9999.");
	return next;
}

export function validateRecurringCron(cron: string, timezone = DEFAULT_SCHEDULE_TIMEZONE): string {
	if (!/^\S+(?:\s+\S+){4,6}$/u.test(cron.trim()))
		throw new Error("Recurring timing must be a 5-, 6-, or 7-part cron expression.");
	try {
		if (new Cron(cron, { timezone }).nextRun() === null)
			throw new Error("The cron expression has no future occurrence.");
	} catch (error) {
		throw new Error(`Invalid recurring cron or timezone: ${cron} (${timezone}).`, { cause: error });
	}
	return cron.trim();
}

export function oneOffCron(runAt: Date): string {
	return [
		runAt.getUTCSeconds(),
		runAt.getUTCMinutes(),
		runAt.getUTCHours(),
		runAt.getUTCDate(),
		runAt.getUTCMonth() + 1,
		"*",
		`${runAt.getUTCFullYear()},9999`,
	].join(" ");
}

export function parseScheduledFireAt(runId: string): number | undefined {
	const match = /_(\d{13})$/u.exec(runId);
	if (match === null) return undefined;
	const timestamp = Number(match[1]);
	return Number.isSafeInteger(timestamp) ? timestamp : undefined;
}

export function isMissedScheduledFire(runId: string, now = Date.now()): boolean {
	const scheduledFireAt = parseScheduledFireAt(runId);
	return scheduledFireAt !== undefined && now - scheduledFireAt > SCHEDULE_GRACE_PERIOD_MS;
}

export function canManageScheduledTask(
	task: ScheduledTaskInput,
	context: Pick<ChannelContext, "channelId" | "threadId">,
): boolean {
	return task.kind === "one-off"
		? task.channelId === context.channelId && task.sourceThreadId === context.threadId
		: task.channelId === context.channelId;
}

export function toScheduledTaskRecord(schedule: WorkflowSchedule): ScheduledTaskRecord {
	const task = scheduledTaskInputSchema.parse(schedule.inputData);
	return {
		id: schedule.id,
		kind: task.kind,
		name: task.name,
		prompt: task.prompt,
		status: schedule.status,
		...(task.kind === "one-off" ? { runAt: task.runAt } : { cron: task.cron }),
		timezone: task.timezone,
		nextRunAt: new Date(schedule.nextFireAt).toISOString(),
		...(schedule.lastFireAt === undefined ? {} : { lastRunAt: new Date(schedule.lastFireAt).toISOString() }),
	};
}

export function asScheduledTask(schedule: WorkflowSchedule): ScheduledTaskInput | undefined {
	const result = scheduledTaskInputSchema.safeParse(schedule.inputData);
	return result.success ? result.data : undefined;
}
