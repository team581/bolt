import { defineJuniorPlugins } from "@sentry/junior";
import { githubPlugin } from "@sentry/junior-github";
import { schedulerPlugin } from "@sentry/junior-scheduler";

export const plugins = defineJuniorPlugins([
	githubPlugin({
		appPermissions: {
			actions: "write",
			contents: "write",
			issues: "write",
			metadata: "read",
			organization_projects: "write",
			pull_requests: "write",
			repository_projects: "write",
			workflows: "write",
		},
	}),
	schedulerPlugin(),
]);
