import { initSentry } from "@sentry/junior/instrumentation";

initSentry();

const [{ createApp }, { config }, { plugins }] = await Promise.all([
	import("@sentry/junior"),
	import("./src/config.ts"),
	import("./plugins.ts"),
]);

const dashboard = {
	allowedGoogleDomains: ["team581.com"],
	...(config.JUNIOR_BASE_URL === undefined ? {} : { trustedOrigins: [config.JUNIOR_BASE_URL] }),
};

export default await createApp({
	dashboard,
	defaultProfile: "bolt",
	experimental: { "passive-routing": true },
	fastModelId: config.BOLT_REPLY_GATE_MODEL_ID,
	guardianModelId: config.BOLT_REPLY_GATE_MODEL_ID,
	plugins,
	profiles: {
		bolt: {
			description:
				"Use for Team 581 robot-code questions, debugging, GitHub project management, WPILOG analysis, and other software-team work.",
			modelId: config.BOLT_MODEL_ID,
			reasoningLevel: "high",
		},
	},
	sandbox: { vcpus: 2 },
});
