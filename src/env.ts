import { cleanEnv, str, url } from "envalid";

export const env = cleanEnv(process.env, {
	JUNIOR_BASE_URL: url({
		desc: "Base URL used by the scheduler heartbeat to call Bolt's Junior API.",
		example: "https://bolt.example.com",
	}),
	JUNIOR_SCHEDULER_SECRET: str({
		desc: "Bearer token used by the scheduler heartbeat endpoint.",
	}),
});
