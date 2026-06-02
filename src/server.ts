import { initSentry } from "@sentry/junior/instrumentation";
initSentry();

import { createApp } from "@sentry/junior";
import { schedulerPlugin } from "@sentry/junior-scheduler";
import * as Sentry from "@sentry/node";

import { startSchedulerHeartbeat } from "./scheduler";

type BackgroundTask = Promise<unknown> | (() => Promise<unknown>);

function waitUntil(task: BackgroundTask) {
	try {
		const promise = typeof task === "function" ? task() : task;
		void promise.catch((error) => {
			Sentry.captureException(error);
		});
	} catch (error) {
		Sentry.captureException(error);
	}
}

const app = await createApp({
	plugins: [schedulerPlugin()],
	waitUntil,
});
startSchedulerHeartbeat();

export default app;
