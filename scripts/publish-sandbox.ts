import { Daytona, DaytonaConflictError, DaytonaNotFoundError, Image, SandboxClass } from "@daytona/sdk";
import assert from "node:assert";
import { join } from "node:path";
import pRetry from "p-retry";

const snapshotName = process.env.SNAPSHOT_NAME;
assert.ok(snapshotName !== undefined, new TypeError("SNAPSHOT_NAME is required"));
assert.ok(snapshotName.length > 0, new RangeError("SNAPSHOT_NAME cannot be empty"));

process.chdir(join(import.meta.dirname, "../sandbox"));

const daytona = new Daytona();
try {
	await daytona.snapshot.delete(snapshotName);
} catch (error) {
	if (!(error instanceof DaytonaNotFoundError)) throw error;
}

await pRetry(
	() =>
		daytona.snapshot.create(
			{
				name: snapshotName,
				image: Image.fromDockerfile("Containerfile"),
				resources: { cpu: 2, memory: 4, disk: 3 },
				sandboxClass: SandboxClass.CONTAINER,
			},
			{
				onLogs: (chunk) => {
					process.stdout.write(chunk);
				},
			},
		),
	{
		retries: 5,
		shouldRetry: ({ error }) => error instanceof DaytonaConflictError,
		onFailedAttempt: ({ error, retriesLeft, retryDelay }) => {
			if (error instanceof DaytonaConflictError && retriesLeft > 0) {
				console.warn(`Snapshot name is still reserved; retrying in ${retryDelay / 1_000} second(s)...`);
			}
		},
	},
);
