import type { ChannelContext } from "@mastra/core/channels";
import type { RequestContext } from "@mastra/core/request-context";
import type { WorkflowSchedule } from "@mastra/core/schedules";
import * as chrono from "chrono-node";
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

export function resolveOneOffTime(
	when: string,
	now = Temporal.Now.instant(),
): { runAt: Temporal.Instant; timezone: string } {
	const expression = when.trim();
	const localNow = now.toZonedDateTimeISO(DEFAULT_SCHEDULE_TIMEZONE);

	const results = chrono.casual.parse(
		expression,
		{ instant: new Date(now.epochMilliseconds), timezone: localNow.offsetNanoseconds / 60_000_000_000 },
		{ forwardDate: true },
	);
	const result = results[0];
	if (
		results.length !== 1 ||
		result === undefined ||
		result.index !== 0 ||
		result.text.length !== expression.length ||
		(result.end !== undefined && result.end !== null)
	) {
		throw new Error(`Invalid or ambiguous one-off time: ${when}.`);
	}

	let runAt: Temporal.Instant;
	try {
		runAt = result.start.isCertain("timezoneOffset")
			? Temporal.Instant.fromEpochMilliseconds(result.start.date().getTime())
			: Temporal.ZonedDateTime.from(
					{
						timeZone: DEFAULT_SCHEDULE_TIMEZONE,
						year: requireDateComponent(result.start, "year"),
						month: requireDateComponent(result.start, "month"),
						day: requireDateComponent(result.start, "day"),
						hour: requireDateComponent(result.start, "hour"),
						minute: requireDateComponent(result.start, "minute"),
						second: requireDateComponent(result.start, "second"),
						millisecond: requireDateComponent(result.start, "millisecond"),
					},
					{ disambiguation: "reject" },
				).toInstant();
	} catch (error) {
		throw new Error(`Invalid or ambiguous one-off time: ${when}.`, { cause: error });
	}

	if (Temporal.Instant.compare(runAt, now) <= 0) throw new Error("A one-off task must be scheduled in the future.");
	if (runAt.toZonedDateTimeISO("UTC").year >= 9999)
		throw new Error("A one-off task must be scheduled before the year 9999.");
	const parsedOffset = result.start.get("timezoneOffset");
	return {
		runAt,
		timezone:
			parsedOffset === null || result.start.tags().has("result/relativeDateAndTime")
				? DEFAULT_SCHEDULE_TIMEZONE
				: offsetToTimeZone(parsedOffset),
	};
}

function requireDateComponent(components: chrono.ParsedComponents, component: chrono.Component): number {
	const value = components.get(component);
	if (value === null) throw new Error(`Parsed time is missing ${component}.`);
	return value;
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

export function oneOffCron(runAt: Temporal.Instant): string {
	const utc = runAt.toZonedDateTimeISO("UTC");
	return [utc.second, utc.minute, utc.hour, utc.day, utc.month, "*", `${utc.year},9999`].join(" ");
}

function offsetToTimeZone(offsetMinutes: number): string {
	const sign = offsetMinutes < 0 ? "-" : "+";
	const absoluteMinutes = Math.abs(offsetMinutes);
	const hours = Math.floor(absoluteMinutes / 60)
		.toString()
		.padStart(2, "0");
	const minutes = (absoluteMinutes % 60).toString().padStart(2, "0");
	return `${sign}${hours}:${minutes}`;
}

export function parseScheduledFireAt(runId: string): Temporal.Instant | undefined {
	const match = /_(\d{13})$/u.exec(runId);
	if (match === null) return undefined;
	const timestamp = Number(match[1]);
	return Number.isSafeInteger(timestamp) ? Temporal.Instant.fromEpochMilliseconds(timestamp) : undefined;
}

export function isMissedScheduledFire(runId: string, now = Temporal.Now.instant()): boolean {
	const scheduledFireAt = parseScheduledFireAt(runId);
	return (
		scheduledFireAt !== undefined &&
		now.epochMilliseconds - scheduledFireAt.epochMilliseconds > SCHEDULE_GRACE_PERIOD_MS
	);
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
		nextRunAt: Temporal.Instant.fromEpochMilliseconds(schedule.nextFireAt).toString({ fractionalSecondDigits: 3 }),
		...(schedule.lastFireAt === undefined
			? {}
			: {
					lastRunAt: Temporal.Instant.fromEpochMilliseconds(schedule.lastFireAt).toString({
						fractionalSecondDigits: 3,
					}),
				}),
	};
}

export function asScheduledTask(schedule: WorkflowSchedule): ScheduledTaskInput | undefined {
	const result = scheduledTaskInputSchema.safeParse(schedule.inputData);
	return result.success ? result.data : undefined;
}
