import { cleanEnv, email, json, num, str, url } from "envalid";

export const env = cleanEnv(process.env, {
	// Vercel AI Gateway
	AI_GATEWAY_API_KEY: str({
		desc: "Vercel AI Gateway API key used by Junior for model calls.",
		docs: "https://junior.sentry.dev/reference/config-and-env/#core-runtime",
	}),
	AI_FAST_MODEL: str({
		desc: "Fast model slug used for lower-latency Junior model calls.",
		docs: "https://junior.sentry.dev/reference/config-and-env/#core-runtime",
	}),
	AI_MODEL: str({
		desc: "Primary model slug used by Junior.",
		docs: "https://junior.sentry.dev/reference/config-and-env/#core-runtime",
	}),
	AI_VISION_MODEL: str({
		desc: "Vision-capable model slug used by Junior.",
		docs: "https://junior.sentry.dev/reference/config-and-env/#core-runtime",
	}),
	AI_WEB_SEARCH_MODEL: str({
		desc: "Model slug used by Junior web search.",
		docs: "https://junior.sentry.dev/reference/config-and-env/#core-runtime",
	}),

	// Junior runtime
	CRON_SECRET: str({
		desc: "Bearer token used by Vercel Cron to call Junior's heartbeat endpoint.",
		docs: "https://junior.sentry.dev/extend/scheduler-plugin/#configure-environment-variables",
	}),
	JUNIOR_BASE_URL: url({
		desc: "Canonical production URL for Bolt.",
		docs: "https://junior.sentry.dev/reference/config-and-env/#core-runtime",
	}),
	JUNIOR_BOT_NAME: str({
		desc: "Display name used by Junior.",
		docs: "https://junior.sentry.dev/reference/config-and-env/#core-runtime",
	}),
	JUNIOR_SLASH_COMMAND: str({
		desc: "Slash command used to trigger Junior in Slack.",
		docs: "https://junior.sentry.dev/reference/config-and-env/#core-runtime",
	}),
	JUNIOR_LOADING_MESSAGES: json<string[]>({
		desc: "JSON array of loading messages shown by Junior.",
		docs: "https://junior.sentry.dev/reference/config-and-env/#core-runtime",
	}),
	JUNIOR_SECRET: str({
		desc: "Shared secret used by Junior for signed internal callbacks.",
		docs: "https://junior.sentry.dev/reference/config-and-env/#core-runtime",
	}),

	// Slack
	SLACK_BOT_TOKEN: str({
		desc: "Slack bot token used by Junior.",
		docs: "https://junior.sentry.dev/reference/config-and-env/#core-runtime",
	}),
	SLACK_SIGNING_SECRET: str({
		desc: "Slack signing secret used by Junior.",
		docs: "https://junior.sentry.dev/reference/config-and-env/#core-runtime",
	}),

	// Dashboard auth
	GOOGLE_CLIENT_ID: str({
		desc: "Google OAuth client ID used by Junior Dashboard auth.",
		docs: "https://junior.sentry.dev/reference/config-and-env/#dashboard-auth",
	}),
	GOOGLE_CLIENT_SECRET: str({
		desc: "Google OAuth client secret used by Junior Dashboard auth.",
		docs: "https://junior.sentry.dev/reference/config-and-env/#dashboard-auth",
	}),

	// GitHub plugin
	GITHUB_APP_BOT_EMAIL: email({
		desc: "Git author email used by the Junior GitHub plugin.",
		docs: "https://junior.sentry.dev/reference/config-and-env/#github-plugin",
	}),
	GITHUB_APP_BOT_NAME: str({
		desc: "Git author name used by the Junior GitHub plugin.",
		docs: "https://junior.sentry.dev/reference/config-and-env/#github-plugin",
	}),
	GITHUB_APP_ID: num({
		desc: "GitHub App ID used by the Junior GitHub plugin.",
		docs: "https://junior.sentry.dev/reference/config-and-env/#github-plugin",
	}),
	GITHUB_APP_PRIVATE_KEY: str({
		desc: "GitHub App private key used by the Junior GitHub plugin.",
		docs: "https://junior.sentry.dev/reference/config-and-env/#github-plugin",
	}),
	GITHUB_INSTALLATION_ID: num({
		desc: "GitHub App installation ID used by the Junior GitHub plugin.",
		docs: "https://junior.sentry.dev/reference/config-and-env/#github-plugin",
	}),

	// Redis
	REDIS_URL: url({
		desc: "Redis connection URL used by Junior state storage.",
		docs: "https://junior.sentry.dev/reference/config-and-env/#core-runtime",
	}),

	// Sentry
	SENTRY_AUTH_TOKEN: str({
		desc: "Sentry auth token used at build time for source map uploads.",
		docs: "https://docs.sentry.dev/cli/configuration/",
	}),
	SENTRY_DSN: url({
		desc: "Sentry DSN used for error reporting.",
		docs: "https://docs.sentry.io/platforms/javascript/guides/node/configuration/environments/#dsn",
	}),
});
