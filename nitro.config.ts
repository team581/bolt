import { defineConfig } from "nitro";
import { juniorNitro } from "@sentry/junior/nitro";

export default defineConfig({
	preset: "vercel",
	sourcemap: true,
	modules: [
		juniorNitro({
			dashboard: {
				allowedGoogleDomains: ["team581.com"],
			},
			plugins: "./plugins",
		}),
	],
	routes: {
		"/**": { handler: "./server.ts" },
	},
});
