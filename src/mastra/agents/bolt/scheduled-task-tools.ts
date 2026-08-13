import type { RequestContext } from "@mastra/core/request-context";
import type { Schedules, WorkflowSchedule } from "@mastra/core/schedules";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import {
	asScheduledTask,
	canManageScheduledTask,
	createScheduledTaskToolInputSchema,
	DEFAULT_SCHEDULE_TIMEZONE,
	normalizeOneOffTime,
	oneOffCron,
	requireSlackContext,
	RUN_SCHEDULED_TASK_WORKFLOW_ID,
	scheduledTaskInputSchema,
	toScheduledTaskRecord,
	updateScheduledTaskToolInputSchema,
	validateRecurringCron,
	type ScheduledTaskInput,
	type ScheduledTaskRecord,
} from "../../scheduled-tasks.ts";

export interface ScheduledTaskServices {
	schedules: Schedules;
	requestContext?: RequestContext;
}

export type CreateScheduledTaskInput = z.input<typeof createScheduledTaskToolInputSchema>;
export type UpdateScheduledTaskInput = z.input<typeof updateScheduledTaskToolInputSchema>;

export async function createScheduledTask(
	services: ScheduledTaskServices,
	rawInput: CreateScheduledTaskInput,
): Promise<ScheduledTaskRecord> {
	const input = createScheduledTaskToolInputSchema.parse(rawInput);
	const context = requireSlackContext(services.requestContext);
	const timezone = input.timezone ?? DEFAULT_SCHEDULE_TIMEZONE;
	const scheduleId = `schedule_${randomUUID()}`;
	const common = {
		scheduleId,
		name: input.name.trim(),
		prompt: input.prompt.trim(),
		channelId: context.channelId,
		sourceThreadId: context.threadId,
		creatorUserId: context.userId,
		createdAt: new Date().toISOString(),
		timezone,
	};
	if (common.name.length === 0) throw new Error("Task name cannot be empty.");
	if (common.prompt.length === 0) throw new Error("Task prompt cannot be empty and must be self-contained.");

	let task: ScheduledTaskInput;
	if (input.runAt !== undefined) {
		task = { ...common, kind: "one-off", runAt: normalizeOneOffTime(input.runAt, timezone).toISOString() };
	} else if (typeof input.cron === "string") {
		task = { ...common, kind: "recurring", cron: validateRecurringCron(input.cron, timezone) };
	} else {
		throw new TypeError("Provide exactly one of runAt or cron.");
	}
	const schedule = await services.schedules.create({
		id: scheduleId,
		workflowId: RUN_SCHEDULED_TASK_WORKFLOW_ID,
		cron: task.kind === "one-off" ? oneOffCron(new Date(task.runAt)) : task.cron,
		timezone: task.kind === "one-off" ? "UTC" : task.timezone,
		inputData: task,
		metadata: { taskKind: task.kind, channelId: task.channelId, sourceThreadId: task.sourceThreadId },
	});
	return toScheduledTaskRecord(schedule);
}

export async function listScheduledTasks(services: ScheduledTaskServices): Promise<ScheduledTaskRecord[]> {
	const context = requireSlackContext(services.requestContext);
	const schedules = await services.schedules.list({ workflowId: RUN_SCHEDULED_TASK_WORKFLOW_ID });
	return schedules
		.filter((schedule) => isWorkflowSchedule(schedule))
		.filter((schedule) => {
			const task = asScheduledTask(schedule);
			return task !== undefined && canManageScheduledTask(task, context);
		})
		.map((schedule) => toScheduledTaskRecord(schedule))
		.toSorted((left, right) => left.nextRunAt.localeCompare(right.nextRunAt));
}

export async function updateScheduledTask(
	services: ScheduledTaskServices,
	rawInput: UpdateScheduledTaskInput,
): Promise<ScheduledTaskRecord> {
	const input = updateScheduledTaskToolInputSchema.parse(rawInput);
	const { schedule, task } = await getManagedTask(services, input.id);
	if (
		(input.runAt !== undefined && task.kind !== "one-off") ||
		(input.cron !== undefined && task.kind !== "recurring")
	) {
		throw new Error("Task kind and destination are immutable; delete and recreate the task to change its kind.");
	}

	const name = input.name?.trim() ?? task.name;
	const prompt = input.prompt?.trim() ?? task.prompt;
	if (name.length === 0) throw new Error("Task name cannot be empty.");
	if (prompt.length === 0) throw new Error("Task prompt cannot be empty and must be self-contained.");

	let updatedTask: ScheduledTaskInput = { ...task, name, prompt };
	let cron = schedule.cron;
	let scheduleTimezone = schedule.timezone;
	if (input.runAt !== undefined && updatedTask.kind === "one-off") {
		const timezone = input.timezone ?? task.timezone;
		const runAt = normalizeOneOffTime(input.runAt, timezone);
		updatedTask = { ...updatedTask, timezone, runAt: runAt.toISOString() };
		cron = oneOffCron(runAt);
		scheduleTimezone = "UTC";
	} else if (input.cron !== undefined && updatedTask.kind === "recurring") {
		const timezone = input.timezone ?? task.timezone;
		const recurringCron = validateRecurringCron(input.cron, timezone);
		updatedTask = { ...updatedTask, timezone, cron: recurringCron };
		cron = recurringCron;
		scheduleTimezone = timezone;
	}

	const updated = await services.schedules.update(schedule.id, {
		cron,
		timezone: scheduleTimezone,
		inputData: scheduledTaskInputSchema.parse(updatedTask),
	});
	if (!isWorkflowSchedule(updated)) throw new Error(`Scheduled task ${input.id} is not workflow-backed.`);
	return toScheduledTaskRecord(updated);
}

export async function deleteScheduledTask(
	services: ScheduledTaskServices,
	id: string,
): Promise<{ deleted: true; id: string }> {
	const { schedule } = await getManagedTask(services, id);
	await services.schedules.delete(schedule.id);
	return { deleted: true, id: schedule.id };
}

async function getManagedTask(
	services: ScheduledTaskServices,
	id: string,
): Promise<{ schedule: WorkflowSchedule; task: ScheduledTaskInput }> {
	const context = requireSlackContext(services.requestContext);
	const schedule = await services.schedules.get(id);
	if (schedule === null || !isWorkflowSchedule(schedule) || schedule.workflowId !== RUN_SCHEDULED_TASK_WORKFLOW_ID) {
		throw new Error(`Scheduled task ${id} was not found.`);
	}
	const task = asScheduledTask(schedule);
	if (task === undefined) throw new Error(`Scheduled task ${id} has invalid stored data.`);
	if (!canManageScheduledTask(task, context))
		throw new Error("This scheduled task belongs to a different Slack conversation.");
	return { schedule, task };
}

function isWorkflowSchedule(schedule: Awaited<ReturnType<Schedules["get"]>>): schedule is WorkflowSchedule {
	return schedule !== null && schedule.workflowId !== undefined;
}
