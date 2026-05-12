import { defineConfig } from "nitro";
import { juniorNitro } from "@sentry/junior/nitro";

export default defineConfig({
	preset: "node-server",
	sourcemap: true,
	modules: [
		juniorNitro({
			pluginPackages: ["@sentry/junior-github", "@team581/manage-github-projects"],
		}),
	],
	routes: {
		"/**": { handler: "./server.ts" },
	},
});
