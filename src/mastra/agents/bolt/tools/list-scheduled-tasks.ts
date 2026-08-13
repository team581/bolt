import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
	asScheduledTask,
	canManageScheduledTask,
	requireSlackContext,
	RUN_SCHEDULED_TASK_WORKFLOW_ID,
	scheduledTaskRecordSchema,
	toScheduledTaskRecord,
	type ScheduledTaskRecord,
} from "../../../scheduled-tasks.ts";
import { isWorkflowSchedule, type ScheduledTaskServices } from "../scheduled-tasks/helpers.ts";

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

export async function listScheduledTasks(services: ScheduledTaskServices): Promise<ScheduledTaskRecord[]> {
	const context = requireSlackContext(services.requestContext);
	const schedules = await services.schedules.list({ workflowId: RUN_SCHEDULED_TASK_WORKFLOW_ID });
	return schedules
		.filter((schedule) => isWorkflowSchedule(schedule))
		.filter((schedule) => {
			const task = asScheduledTask(schedule);
			return task !== undefined && canManageScheduledTask(task, context);
		})
		.map((schedule) => toScheduledTaskRecord(schedule))
		.toSorted((left, right) => left.nextRunAt.localeCompare(right.nextRunAt));
}
