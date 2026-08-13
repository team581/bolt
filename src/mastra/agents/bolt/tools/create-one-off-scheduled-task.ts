import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
	DEFAULT_SCHEDULE_TIMEZONE,
	normalizeOneOffTime,
	scheduledTaskRecordSchema,
	type ScheduledTaskRecord,
} from "../../../scheduled-tasks.ts";
import { createOneOffTask, scheduledTaskModelOutput, type ScheduledTaskServices } from "../scheduled-tasks/helpers.ts";

const inputSchema = z.object({
	name: z.string().min(1),
	prompt: z.string().min(1).describe("A self-contained prompt with all context needed when the task runs."),
	runAt: z.string().min(1).describe("An ISO date/time or local date/time."),
	timezone: z.string().optional().describe("IANA timezone; defaults to America/Los_Angeles."),
});

export default createTool({
	id: "create_one_off_scheduled_task",
	description: "Create a one-off Bolt task that runs once and replies in this Slack thread.",
	inputSchema,
	outputSchema: scheduledTaskRecordSchema,
	toModelOutput: scheduledTaskModelOutput,
	execute: (input, context) => {
		if (context?.mastra === undefined) throw new Error("Mastra is unavailable.");
		return createOneOffScheduledTask(
			{ schedules: context.mastra.schedules, requestContext: context.requestContext },
			input,
		);
	},
});

export function createOneOffScheduledTask(
	services: ScheduledTaskServices,
	input: z.infer<typeof inputSchema>,
): Promise<ScheduledTaskRecord> {
	const timezone = input.timezone ?? DEFAULT_SCHEDULE_TIMEZONE;
	return createOneOffTask(services, {
		...input,
		timezone,
		runAt: normalizeOneOffTime(input.runAt, timezone),
	});
}
