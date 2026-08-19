import { PostgresStoreVNext } from "@mastra/pg";
import { config } from "../config.ts";

export const storage = new PostgresStoreVNext({
	id: "bolt-postgres",
	connectionString: config.DATABASE_URL,
	observability: { connectionString: config.DATABASE_URL },
});
