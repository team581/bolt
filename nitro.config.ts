import { defineConfig } from "nitro";
import { juniorDashboardNitro } from "@sentry/junior-dashboard/nitro";
import { juniorNitro } from "@sentry/junior/nitro";

export default defineConfig({
	preset: "node-server",
	sourcemap: true,
	modules: [
		juniorDashboardNitro({
			allowedGoogleDomains: ["team581.com"],
		}),
		juniorNitro({
			plugins: {
				packages: ["@sentry/junior-github"],
			},
		}),
	],
	routes: {
		"/**": { handler: "./server.ts" },
	},
});
