import { cleanEnv, email, json, makeValidator, num, url } from "envalid";

const nonEmptyString = makeValidator<string>((input) => {
	if (!input.trim()) throw new Error("Expected a non-empty string");
	return input;
});

export const isDevelopment = process.env.MASTRA_DEV === "true" || process.env.NODE_ENV === "development";

export const config = cleanEnv(process.env, {
	AI_GATEWAY_API_KEY: nonEmptyString({
		desc: "Vercel AI Gateway API key",
	}),
	BOLT_MODEL_ID: nonEmptyString({
		default: "alibaba/qwen3.8-max",
		desc: "Model ID served by the Vercel AI Gateway",
	}),
	BOLT_REPLY_GATE_MODEL_ID: nonEmptyString({
		default: "openai/gpt-5.6-luna",
		desc: "Fast model used to decide whether Bolt should reply to an unmentioned Slack message",
	}),
	DATABASE_URL: url({
		desc: "PostgreSQL connection URL",
	}),
	DAYTONA_API_KEY: nonEmptyString({
		desc: "Daytona API key used to create Bolt sandboxes",
	}),
	DAYTONA_API_URL: url({
		default: undefined,
		desc: "Optional Daytona API endpoint",
	}),
	DAYTONA_TARGET: nonEmptyString({
		default: undefined,
		desc: "Optional Daytona runner region",
	}),
	GITHUB_APP_BOT_EMAIL: email({
		default: "283250081+team-581-bolt[bot]@users.noreply.github.com",
		desc: "Git author email used in Bolt sandboxes",
	}),
	GITHUB_APP_BOT_NAME: nonEmptyString({
		default: "team-581-bolt[bot]",
		desc: "Git author name used in Bolt sandboxes",
	}),
	GITHUB_APP_ID: nonEmptyString({
		desc: "GitHub App ID",
	}),
	GITHUB_APP_PRIVATE_KEY: nonEmptyString({
		desc: "GitHub App private key",
	}),
	GITHUB_INSTALLATION_ID: num({
		desc: "GitHub App installation ID",
	}),
	GCS_SERVICE_ACCOUNT_KEY: json<object>({
		desc: "Service account key JSON with read-only access to the Fetch GCS bucket",
	}),
	MASTRA_API_KEY: nonEmptyString({
		desc: "API key used to authenticate requests to the Mastra server",
	}),
	MASTRA_PLATFORM_ACCESS_TOKEN: nonEmptyString({
		desc: "Access token used to send observability data to the Mastra platform",
	}),
	MASTRA_PROJECT_ID: nonEmptyString({
		desc: "Mastra platform project ID",
	}),
	SENTRY_DSN: url({
		default: undefined,
		desc: "Sentry project DSN",
	}),
	SLACK_BOT_TOKEN: nonEmptyString({
		desc: "Slack bot OAuth token",
	}),
	SLACK_APP_TOKEN: nonEmptyString({
		default: undefined,
		desc: "Slack app-level token used for Socket Mode in development",
		requiredWhen: () => isDevelopment,
	}),
	SLACK_SIGNING_SECRET: nonEmptyString({
		default: undefined,
		desc: "Slack webhook signing secret used outside development",
		requiredWhen: () => !isDevelopment,
	}),
});
