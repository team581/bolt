import { defineJuniorPlugins } from "@sentry/junior";
import { juniorDashboardPlugin } from "@sentry/junior-dashboard";
import { githubPlugin } from "@sentry/junior-github";
import { schedulerPlugin } from "@sentry/junior-scheduler";

export const plugins = defineJuniorPlugins([
	juniorDashboardPlugin({
		allowedGoogleDomains: ["team581.com"],
	}),
	githubPlugin(),
	schedulerPlugin(),
]);
