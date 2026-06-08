import { defineConfig } from "nitro";
import { juniorNitro } from "@sentry/junior/nitro";

export default defineConfig({
	preset: "vercel",
	sourcemap: true,
	modules: [
		juniorNitro({
			plugins: "./src/plugins",
		}),
	],
	routes: {
		"/**": { handler: "./src/server.ts" },
	},
});
