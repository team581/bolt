import { PostgresStore } from "@mastra/pg";
import { config } from "../config.ts";

export const storage = new PostgresStore({
	id: "bolt-postgres",
	connectionString: config.DATABASE_URL,
});
