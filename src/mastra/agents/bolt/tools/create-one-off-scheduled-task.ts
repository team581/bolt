import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
	resolveOneOffTime,
	scheduledTaskContentSchema,
	scheduledTaskRecordSchema,
	type ScheduledTaskRecord,
} from "../../../scheduled-tasks.ts";
import { createOneOffTask, scheduledTaskModelOutput, type ScheduledTaskServices } from "../scheduled-tasks/helpers.ts";

const inputSchema = scheduledTaskContentSchema.extend({
	when: z
		.string()
		.min(1)
		.describe(
			'A natural-language or ISO date/time, optionally including a timezone abbreviation or offset, such as "today at 5pm", "in a week", "tomorrow at 5pm PT", or an ISO timestamp.',
		),
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
	const resolved = resolveOneOffTime(input.when);
	return createOneOffTask(services, {
		name: input.name,
		prompt: input.prompt,
		...resolved,
	});
}
