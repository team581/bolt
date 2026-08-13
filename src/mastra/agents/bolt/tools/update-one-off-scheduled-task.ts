import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
	normalizeOneOffTime,
	oneOffCron,
	scheduledTaskRecordSchema,
	toScheduledTaskRecord,
	type ScheduledTaskRecord,
} from "../../../scheduled-tasks.ts";
import { getManagedTask, isWorkflowSchedule, type ScheduledTaskServices } from "../scheduled-tasks/helpers.ts";

const inputSchema = z.object({
	id: z.string(),
	name: z.string().min(1).optional(),
	prompt: z
		.string()
		.min(1)
		.optional()
		.describe("A self-contained replacement prompt with all context needed when the task runs."),
	runAt: z.string().min(1).optional().describe("A replacement ISO date/time or local date/time."),
	timezone: z.string().optional().describe("IANA timezone; only used with runAt."),
});

export default createTool({
	id: "update_one_off_scheduled_task",
	description: "Update a one-off scheduled task's name, self-contained prompt, or run time.",
	inputSchema,
	outputSchema: scheduledTaskRecordSchema,
	execute: (input, context) => {
		if (context?.mastra === undefined) throw new Error("Mastra is unavailable.");
		return updateOneOffScheduledTask(
			{ schedules: context.mastra.schedules, requestContext: context.requestContext },
			input,
		);
	},
});

export async function updateOneOffScheduledTask(
	services: ScheduledTaskServices,
	input: z.infer<typeof inputSchema>,
): Promise<ScheduledTaskRecord> {
	if (input.timezone !== undefined && input.runAt === undefined)
		throw new TypeError("A timezone update must include runAt.");
	if (input.name === undefined && input.prompt === undefined && input.runAt === undefined)
		throw new TypeError("Provide a name, prompt, or runAt to update.");

	const { schedule, task } = await getManagedTask(services, input.id);
	if (task.kind !== "one-off") throw new Error("This is a recurring task; delete and recreate it to change its kind.");

	const name = input.name?.trim() ?? task.name;
	const prompt = input.prompt?.trim() ?? task.prompt;
	if (name.length === 0) throw new Error("Task name cannot be empty.");
	if (prompt.length === 0) throw new Error("Task prompt cannot be empty and must be self-contained.");

	let updatedTask = { ...task, name, prompt };
	let cron = schedule.cron;
	if (input.runAt !== undefined) {
		const timezone = input.timezone ?? task.timezone;
		const runAt = normalizeOneOffTime(input.runAt, timezone);
		updatedTask = { ...updatedTask, timezone, runAt: runAt.toISOString() };
		cron = oneOffCron(runAt);
	}

	const updated = await services.schedules.update(schedule.id, {
		cron,
		timezone: "UTC",
		inputData: updatedTask,
	});
	if (!isWorkflowSchedule(updated)) throw new Error(`Scheduled task ${input.id} is not workflow-backed.`);
	return toScheduledTaskRecord(updated);
}
