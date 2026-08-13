import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
	scheduledTaskRecordSchema,
	toScheduledTaskRecord,
	validateRecurringCron,
	type ScheduledTaskRecord,
} from "../../../scheduled-tasks.ts";
import {
	getManagedTask,
	isWorkflowSchedule,
	scheduledTaskModelOutput,
	type ScheduledTaskServices,
} from "../scheduled-tasks/helpers.ts";

const inputSchema = z.object({
	id: z.string(),
	name: z.string().min(1).optional(),
	prompt: z
		.string()
		.min(1)
		.optional()
		.describe("A self-contained replacement prompt with all context needed when the task runs."),
	cron: z.string().min(1).optional().describe("A replacement 5-, 6-, or 7-part cron expression."),
	timezone: z.string().optional().describe("IANA timezone; only used with cron."),
});

export default createTool({
	id: "update_recurring_scheduled_task",
	description: "Update a recurring scheduled task's name, self-contained prompt, or recurrence.",
	inputSchema,
	outputSchema: scheduledTaskRecordSchema,
	toModelOutput: scheduledTaskModelOutput,
	execute: (input, context) => {
		if (context?.mastra === undefined) throw new Error("Mastra is unavailable.");
		return updateRecurringScheduledTask(
			{ schedules: context.mastra.schedules, requestContext: context.requestContext },
			input,
		);
	},
});

export async function updateRecurringScheduledTask(
	services: ScheduledTaskServices,
	input: z.infer<typeof inputSchema>,
): Promise<ScheduledTaskRecord> {
	if (input.timezone !== undefined && input.cron === undefined)
		throw new TypeError("A timezone update must include cron.");
	if (input.name === undefined && input.prompt === undefined && input.cron === undefined)
		throw new TypeError("Provide a name, prompt, or cron to update.");

	const { schedule, task } = await getManagedTask(services, input.id);
	if (task.kind !== "recurring") throw new Error("This is a one-off task; delete and recreate it to change its kind.");

	const name = input.name?.trim() ?? task.name;
	const prompt = input.prompt?.trim() ?? task.prompt;
	if (name.length === 0) throw new Error("Task name cannot be empty.");
	if (prompt.length === 0) throw new Error("Task prompt cannot be empty and must be self-contained.");

	let updatedTask = { ...task, name, prompt };
	let cron = schedule.cron;
	let timezone = schedule.timezone;
	if (input.cron !== undefined) {
		timezone = input.timezone ?? task.timezone;
		cron = validateRecurringCron(input.cron, timezone);
		updatedTask = { ...updatedTask, timezone, cron };
	}

	const updated = await services.schedules.update(schedule.id, {
		cron,
		timezone,
		inputData: updatedTask,
	});
	if (!isWorkflowSchedule(updated)) throw new Error(`Scheduled task ${input.id} is not workflow-backed.`);
	return toScheduledTaskRecord(updated);
}
