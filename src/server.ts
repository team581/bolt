import { initSentry } from "@sentry/junior/instrumentation";
initSentry();

import { createApp } from "@sentry/junior";

await import("./env");

const app = await createApp();

export default app;
