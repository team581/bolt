import { defineJuniorPlugins } from "@sentry/junior";
import { boltRuntimePlugin } from "./app/plugins/bolt-runtime.ts";
import { githubMembershipPlugin } from "./app/plugins/github-membership.ts";
import { googleWorkspacePlugins } from "./app/plugins/google-workspace.ts";

export const plugins = defineJuniorPlugins([
	boltRuntimePlugin(),
	githubMembershipPlugin(),
	...googleWorkspacePlugins(),
]);
