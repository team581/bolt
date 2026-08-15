import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
	normalizeScheduledTaskContent,
	oneOffCron,
	resolveOneOffTime,
	scheduledTaskContentSchema,
	scheduledTaskRecordSchema,
	toScheduledTaskRecord,
	type ScheduledTaskRecord,
} from "../../../scheduled-tasks.ts";
import {
	getManagedTask,
	isWorkflowSchedule,
	scheduledTaskModelOutput,
	type ScheduledTaskServices,
} from "../scheduled-tasks/helpers.ts";

const inputSchema = scheduledTaskContentSchema.partial().extend({
	id: z.string(),
	when: z
		.string()
		.min(1)
		.optional()
		.describe(
			"A replacement natural-language or ISO date/time, optionally including a timezone abbreviation or offset.",
		),
});

export default createTool({
	id: "update_one_off_scheduled_task",
	description: "Update a one-off scheduled task's name, self-contained prompt, or run time.",
	inputSchema,
	outputSchema: scheduledTaskRecordSchema,
	toModelOutput: scheduledTaskModelOutput,
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
	if (input.name === undefined && input.prompt === undefined && input.when === undefined)
		throw new TypeError("Provide a name, prompt, or when to update.");

	const { schedule, task } = await getManagedTask(services, input.id);
	if (task.kind !== "one-off") throw new Error("This is a recurring task; delete and recreate it to change its kind.");

	let updatedTask = { ...task, ...normalizeScheduledTaskContent(task, input) };
	let cron = schedule.cron;
	if (input.when !== undefined) {
		const resolved = resolveOneOffTime(input.when);
		updatedTask = {
			...updatedTask,
			timezone: resolved.timezone,
			runAt: resolved.runAt.toString({ fractionalSecondDigits: 3 }),
		};
		cron = oneOffCron(resolved.runAt);
	}

	const updated = await services.schedules.update(schedule.id, {
		cron,
		timezone: "UTC",
		inputData: updatedTask,
	});
	if (!isWorkflowSchedule(updated)) throw new Error(`Scheduled task ${input.id} is not workflow-backed.`);
	return toScheduledTaskRecord(updated);
}
