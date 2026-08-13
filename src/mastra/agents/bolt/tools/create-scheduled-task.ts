import { createTool } from "@mastra/core/tools";
import { createScheduledTaskToolInputSchema, scheduledTaskRecordSchema } from "../../../scheduled-tasks.ts";
import { createScheduledTask } from "../scheduled-task-tools.ts";

export default createTool({
	id: "create_scheduled_task",
	description:
		"Create a scheduled Bolt task. Provide exactly one of runAt (one-off) or cron (recurring). Prompts must be self-contained because recurring runs have fresh context. One-offs return to this Slack thread; each recurring run creates a fresh thread in this channel.",
	inputSchema: createScheduledTaskToolInputSchema,
	outputSchema: scheduledTaskRecordSchema,
	execute: (input, context) => {
		if (context?.mastra === undefined) throw new Error("Mastra is unavailable.");
		return createScheduledTask({ schedules: context.mastra.schedules, requestContext: context.requestContext }, input);
	},
});
