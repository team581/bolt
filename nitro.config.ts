import { juniorNitro } from "@sentry/junior/nitro";
import { withSentryConfig } from "@sentry/nitro";
import { defineConfig } from "nitro";

const dashboard = {
	allowedGoogleDomains: ["team581.com"],
	trustedOrigins: process.env.JUNIOR_BASE_URL === undefined ? undefined : [process.env.JUNIOR_BASE_URL],
};

const config = defineConfig({
	modules: [juniorNitro({ dashboard, plugins: "./plugins" })],
	preset: "vercel",
	routes: { "/**": { handler: "./server.ts" } },
	traceDeps: ["h3"],
});

export default withSentryConfig(config, {
	authToken: process.env.SENTRY_AUTH_TOKEN,
	org: process.env.SENTRY_ORG,
	project: process.env.SENTRY_PROJECT,
});
