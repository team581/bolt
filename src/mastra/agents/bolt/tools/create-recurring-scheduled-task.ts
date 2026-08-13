import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
	DEFAULT_SCHEDULE_TIMEZONE,
	scheduledTaskRecordSchema,
	type ScheduledTaskRecord,
	validateRecurringCron,
} from "../../../scheduled-tasks.ts";
import {
	createRecurringTask,
	scheduledTaskModelOutput,
	type ScheduledTaskServices,
} from "../scheduled-tasks/helpers.ts";

const inputSchema = z.object({
	name: z.string().min(1),
	prompt: z.string().min(1).describe("A self-contained prompt with all context needed when the task runs."),
	cron: z.string().min(1).describe("A 5-, 6-, or 7-part cron expression."),
	timezone: z.string().optional().describe("IANA timezone; defaults to America/Los_Angeles."),
});

export default createTool({
	id: "create_recurring_scheduled_task",
	description:
		"Create a recurring Bolt task. Each run starts a fresh Slack thread in this channel, so the prompt must be self-contained.",
	inputSchema,
	outputSchema: scheduledTaskRecordSchema,
	toModelOutput: scheduledTaskModelOutput,
	execute: (input, context) => {
		if (context?.mastra === undefined) throw new Error("Mastra is unavailable.");
		return createRecurringScheduledTask(
			{ schedules: context.mastra.schedules, requestContext: context.requestContext },
			input,
		);
	},
});

export function createRecurringScheduledTask(
	services: ScheduledTaskServices,
	input: z.infer<typeof inputSchema>,
): Promise<ScheduledTaskRecord> {
	const timezone = input.timezone ?? DEFAULT_SCHEDULE_TIMEZONE;
	const cron = validateRecurringCron(input.cron, timezone);
	return createRecurringTask(
		services,
		{
			...input,
			kind: "recurring",
			timezone,
			cron,
		},
		cron,
	);
}
