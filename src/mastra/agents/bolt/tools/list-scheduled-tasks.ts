import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { scheduledTaskRecordSchema } from "../../../scheduled-tasks.ts";
import { listScheduledTasks } from "../scheduled-task-tools.ts";

export default createTool({
	id: "list_scheduled_tasks",
	description: "List scheduled tasks manageable from this Slack conversation.",
	inputSchema: z.object({}),
	outputSchema: z.array(scheduledTaskRecordSchema),
	execute: (_input, context) => {
		if (context?.mastra === undefined) throw new Error("Mastra is unavailable.");
		return listScheduledTasks({ schedules: context.mastra.schedules, requestContext: context.requestContext });
	},
});
