import { Workspace } from "@mastra/core/workspace";
import { resolveBoltSandbox } from "./sandbox.ts";

export default new Workspace({
	id: "bolt-workspace",
	name: "Bolt Workspace",
	instructions: {
		dynamicSandbox: () =>
			"A Sandbox for this Slack thread has been configured. It expires after 24 hours of inactivity, so any code changes should be pushed to a branch.",
	},
	sandbox: ({ requestContext }) => resolveBoltSandbox(requestContext),
});
