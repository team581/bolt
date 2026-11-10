import { fileURLToPath } from "node:url";
import { createNitro } from "nitro/builder";
import { expect, it } from "vitest";

it("keeps one daily heartbeat and Junior's retention cron after module setup", async () => {
	const nitro = await createNitro({ rootDir: fileURLToPath(new URL("..", import.meta.url)) });
	try {
		expect(nitro.options.vercel?.config?.crons).toEqual([
			{ path: "/api/internal/heartbeat", schedule: "0 0 * * *" },
			{ path: "/api/internal/retention", schedule: "0 4 * * *" },
		]);
	} finally {
		await nitro.close();
	}
});
