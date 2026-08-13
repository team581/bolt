import { createTool } from "@mastra/core/tools";
import { scheduledTaskRecordSchema, updateScheduledTaskToolInputSchema } from "../../../scheduled-tasks.ts";
import { updateScheduledTask } from "../scheduled-task-tools.ts";

export default createTool({
	id: "update_scheduled_task",
	description:
		"Update a scheduled task's name, self-contained prompt, or timing. To update timing, provide runAt for a one-off or cron for a recurring task, never both. Task kind and Slack destination cannot change.",
	inputSchema: updateScheduledTaskToolInputSchema,
	outputSchema: scheduledTaskRecordSchema,
	execute: (input, context) => {
		if (context?.mastra === undefined) throw new Error("Mastra is unavailable.");
		return updateScheduledTask({ schedules: context.mastra.schedules, requestContext: context.requestContext }, input);
	},
});
