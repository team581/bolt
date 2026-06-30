import { initSentry } from "@sentry/junior/instrumentation";
initSentry();

import { createApp } from "@sentry/junior";
import { plugins } from "./plugins";

await import("./src/env");

const app = await createApp({
	dashboard: {
		allowedGoogleDomains: ["team581.com"],
	},
	plugins,
});

export default app;
