import { initSentry } from "@sentry/junior/instrumentation";
initSentry();

import { createApp } from "@sentry/junior";
import { schedulerPlugin } from "@sentry/junior-scheduler";
import * as Sentry from "@sentry/node";
import ky from "ky";

const juniorBaseUrl = process.env.JUNIOR_BASE_URL?.trim();
const schedulerSecret = process.env.JUNIOR_SCHEDULER_SECRET?.trim();

if (!juniorBaseUrl) {
	throw new RangeError("JUNIOR_BASE_URL is required for the scheduler heartbeat.");
}

if (!schedulerSecret) {
	throw new RangeError("JUNIOR_SCHEDULER_SECRET is required for the scheduler heartbeat.");
}

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

const SCHEDULER_HEARTBEAT_INTERVAL_MS = 60_000;

const http = ky.create({
	baseUrl: juniorBaseUrl,
	headers: {
		Authorization: `Bearer ${schedulerSecret}`,
	},
});

async function runSchedulerHeartbeat() {
	await http.get("/api/internal/heartbeat");
}

const tick = () => {
	void runSchedulerHeartbeat().catch((error) => {
		Sentry.captureException(error);
	});
};

const schedulerHeartbeatTimer = setInterval(tick, SCHEDULER_HEARTBEAT_INTERVAL_MS);
schedulerHeartbeatTimer.unref?.();
tick();

export default app;
