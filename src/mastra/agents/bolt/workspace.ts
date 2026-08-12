import { Workspace } from "@mastra/core/workspace";
import { resolveBoltSandbox } from "./sandbox.ts";

export default new Workspace({
	id: "bolt-workspace",
	name: "Bolt Workspace",
	instructions: { dynamicSandbox: "resolve" },
	sandbox: ({ requestContext }) => resolveBoltSandbox(requestContext),
});
