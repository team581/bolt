import { postgres } from "@flue/postgres";
import { Pool } from "pg";
import { config } from "./config.ts";

export const pool: Pool = new Pool({ connectionString: config.DATABASE_URL });

export default postgres({
	query: async (text, params) => (await pool.query(text, params)).rows,
	transaction: async (fn) => {
		const client = await pool.connect();
		try {
			await client.query("BEGIN");
			const result = await fn({
				query: async (text, params) => (await client.query(text, params)).rows,
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
