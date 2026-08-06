import { postgres, type PostgresQuery } from "@flue/postgres";
import type { PersistenceAdapter } from "@flue/runtime/adapter";
import { Pool } from "pg";
import { config } from "./config.ts";

export const pool: Pool = new Pool({ connectionString: config.DATABASE_URL });

const query: PostgresQuery = async (text, params) => (await pool.query<Record<string, unknown>>(text, params)).rows;

const database: PersistenceAdapter = postgres({
	query,
	transaction: async (fn) => {
		const client = await pool.connect();
		try {
			await client.query("BEGIN");
			const result = await fn({
				query: async (text, params) => (await client.query<Record<string, unknown>>(text, params)).rows,
			});
			await client.query("COMMIT");
			return result;
		} catch (error) {
			await client.query("ROLLBACK");
			throw error;
		} finally {
			client.release();
		}
	},
	close: () => pool.end(),
});

export default database;
