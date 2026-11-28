import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";

it("keeps legacy agent profile reads working while the previous deployment still serves requests", () => {
	const require = createRequire(import.meta.url);
	const migration = readFileSync(
		join(dirname(require.resolve("@sentry/junior")), "../migrations/0077_drop_agent_invocation_model_profile.sql"),
		"utf8",
	);
	// This migration's SQL also runs in SQLite; the full upgrade is tested separately on PostgreSQL.
	const db = new DatabaseSync(":memory:");
	try {
		db.exec("CREATE TABLE junior_agent_invocations (invocation_id TEXT PRIMARY KEY, model_profile TEXT)");
		db.exec("INSERT INTO junior_agent_invocations VALUES ('legacy-agent', 'bolt')");
		db.exec(migration);
		expect(
			db.prepare("SELECT model_profile FROM junior_agent_invocations WHERE invocation_id = ?").get("legacy-agent"),
		).toMatchObject({ model_profile: "bolt" });
	} finally {
		db.close();
	}
});
