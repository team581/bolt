import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getManagedTask, type ScheduledTaskServices } from "../scheduled-tasks/helpers.ts";

export default createTool({
	id: "delete_scheduled_task",
	description: "Delete a scheduled task manageable from this Slack conversation.",
	inputSchema: z.object({ id: z.string() }),
	outputSchema: z.object({ deleted: z.literal(true), id: z.string() }),
	execute: ({ id }, context) => {
		if (context?.mastra === undefined) throw new Error("Mastra is unavailable.");
		return deleteScheduledTask({ schedules: context.mastra.schedules, requestContext: context.requestContext }, id);
	},
});

export async function deleteScheduledTask(
	services: ScheduledTaskServices,
	id: string,
): Promise<{ deleted: true; id: string }> {
	const { schedule } = await getManagedTask(services, id);
	await services.schedules.delete(schedule.id);
	return { deleted: true, id: schedule.id };
}
