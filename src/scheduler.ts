import * as Sentry from "@sentry/node";

import { http } from "./http";

const SCHEDULER_HEARTBEAT_INTERVAL_MS = 60_000;

export async function runSchedulerHeartbeat() {
	await http.get("/api/internal/heartbeat");
}

export function startSchedulerHeartbeat() {
	const tick = () => {
		void runSchedulerHeartbeat().catch((error) => {
			Sentry.captureException(error);
		});
	};
	const schedulerHeartbeatTimer = setInterval(tick, SCHEDULER_HEARTBEAT_INTERVAL_MS);
	schedulerHeartbeatTimer.unref?.();
	tick();

	return schedulerHeartbeatTimer;
}
