import { juniorNitro, withSentryConfig } from "@sentry/junior/nitro";
import { defineConfig } from "nitro";

const dashboard = {
	trustedOrigins: process.env.JUNIOR_BASE_URL === undefined ? undefined : [process.env.JUNIOR_BASE_URL],
};

const config = defineConfig({
	modules: [juniorNitro({ dashboard, plugins: "./plugins" })],
	preset: "vercel",
	vercel: {
		skewProtection: false,
		config: {
			version: 3,
			// Temporary Vercel Hobby mitigation; scheduled work and recovery wait for this daily tick.
			crons: [{ path: "/api/internal/heartbeat", schedule: "0 0 * * *" }],
		},
	},
	routes: { "/**": { handler: "./server.ts" } },
	traceDeps: ["h3"],
});

export default withSentryConfig(config, {
	authToken: process.env.SENTRY_AUTH_TOKEN,
	org: process.env.SENTRY_ORG,
	project: process.env.SENTRY_PROJECT,
});
