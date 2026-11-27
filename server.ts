import { initSentry } from "@sentry/junior/instrumentation";

initSentry();

const [{ createApp }, { config }, { plugins }] = await Promise.all([
	import("@sentry/junior"),
	import("./src/config.ts"),
	import("./plugins.ts"),
]);

const dashboard = config.JUNIOR_BASE_URL === undefined ? {} : { trustedOrigins: [config.JUNIOR_BASE_URL] };

export default await createApp({
	// The Junior runtime patch keeps Slack workspace access independent of this Dashboard allowlist.
	allowedDomains: ["team581.com"],
	dashboard,
	experimental: { "passive-routing": true },
	fastModelId: config.BOLT_REPLY_GATE_MODEL_ID,
	guardianModelId: config.BOLT_REPLY_GATE_MODEL_ID,
	modelId: config.BOLT_MODEL_ID,
	plugins,
	sandbox: { vcpus: 2 },
});
