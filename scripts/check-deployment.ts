import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

type Deployment = { crons?: Array<{ path: string; schedule: string }> };
const deployment = JSON.parse(readFileSync(".vercel/output/config.json", "utf8")) as Deployment;
const crons = deployment.crons ?? [];
assert.equal(crons.find((cron) => cron.path === "/api/internal/heartbeat")?.schedule, "0 0 * * *");
assert.ok(crons.length > 0, "Junior must retain its daily heartbeat");
for (const cron of crons) {
	assert.match(
		cron.schedule,
		/^\d{1,2} \d{1,2} \* \* \*$/u,
		`${cron.path} must run at most once daily on Vercel Hobby`,
	);
	const [minute, hour] = cron.schedule.split(" ").map(Number);
	assert.ok(minute! < 60 && hour! < 24, `${cron.path} has an invalid daily schedule`);
}
console.log("Deployment checks passed: heartbeat and all generated cron schedules remain daily.");
