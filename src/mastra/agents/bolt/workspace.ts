import { Workspace } from "@mastra/core/workspace";
import type { DaytonaSandbox } from "@mastra/daytona";
import { BOLT_SANDBOX_CONTEXT_KEY } from "./sandbox.ts";

export default new Workspace({
	id: "bolt-workspace",
	name: "Bolt Workspace",
	instructions: { dynamicSandbox: "resolve" },
	sandbox: ({ requestContext }) => {
		const sandbox = requestContext.get<string, DaytonaSandbox | undefined>(BOLT_SANDBOX_CONTEXT_KEY);
		if (sandbox === undefined) throw new Error("Bolt sandbox is not available for this request.");
		return sandbox;
	},
});
