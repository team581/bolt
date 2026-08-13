import type { RequestContext } from "@mastra/core/request-context";
import type { Schedules, WorkflowSchedule } from "@mastra/core/schedules";
import { randomUUID } from "node:crypto";
import {
	asScheduledTask,
	canManageScheduledTask,
	oneOffCron,
	requireSlackContext,
	RUN_SCHEDULED_TASK_WORKFLOW_ID,
	toScheduledTaskRecord,
	type ScheduledTaskInput,
	type ScheduledTaskRecord,
} from "../../../scheduled-tasks.ts";

export interface ScheduledTaskServices {
	schedules: Schedules;
	requestContext?: RequestContext;
}

type NewTask = {
	name: string;
	prompt: string;
	timezone: string;
};

type NewScheduledTask = NewTask & ({ kind: "one-off"; runAt: string } | { kind: "recurring"; cron: string });

export async function createRecurringTask(
	services: ScheduledTaskServices,
	input: NewScheduledTask,
	cron: string,
	timezone = input.timezone,
): Promise<ScheduledTaskRecord> {
	const context = requireSlackContext(services.requestContext);
	const name = input.name.trim();
	const prompt = input.prompt.trim();
	if (name.length === 0) throw new Error("Task name cannot be empty.");
	if (prompt.length === 0) throw new Error("Task prompt cannot be empty and must be self-contained.");

	const common = {
		scheduleId: `schedule_${randomUUID()}`,
		name,
		prompt,
		channelId: context.channelId,
		sourceThreadId: context.threadId,
		creatorUserId: context.userId,
		createdAt: new Date().toISOString(),
		timezone: input.timezone,
	};
	const task: ScheduledTaskInput = { ...common, ...input, name, prompt };
	const schedule = await services.schedules.create({
		id: task.scheduleId,
		workflowId: RUN_SCHEDULED_TASK_WORKFLOW_ID,
		cron,
		timezone,
		inputData: task,
		metadata: { taskKind: task.kind, channelId: task.channelId, sourceThreadId: task.sourceThreadId },
	});
	return toScheduledTaskRecord(schedule);
}

export function createOneOffTask(
	services: ScheduledTaskServices,
	input: NewTask & { runAt: Date },
): Promise<ScheduledTaskRecord> {
	return createRecurringTask(
		services,
		{ ...input, kind: "one-off", runAt: input.runAt.toISOString() },
		oneOffCron(input.runAt),
		"UTC",
	);
}

export async function getManagedTask(
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

export function isWorkflowSchedule(schedule: Awaited<ReturnType<Schedules["get"]>>) {
	return schedule !== null && schedule.workflowId !== undefined;
}
