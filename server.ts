import { initSentry } from "@sentry/junior/instrumentation";
initSentry();

import { createApp } from "@sentry/junior";
import { plugins } from "./plugins";

await import("./src/env");

const app = await createApp({ plugins });

export default app;
