import ky from "ky";

import { env } from "./env";

export const http = ky.create({
	baseUrl: env.JUNIOR_BASE_URL,
	headers: {
		Authorization: `Bearer ${env.JUNIOR_SCHEDULER_SECRET}`,
	},
});
