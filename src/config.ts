import { cleanEnv, email, makeValidator, num, url } from "envalid";

const defaultSandboxImageTag =
	process.env.RAILWAY_ENVIRONMENT_NAME === "production" ? (process.env.RAILWAY_GIT_COMMIT_SHA ?? "latest") : "latest";
const defaultSandboxImage = `ghcr.io/team581/bolt-sandbox:${defaultSandboxImageTag}`;

const nonEmptyString = makeValidator<string>((input) => {
	if (!input.trim()) throw new Error("Expected a non-empty string");
	return input;
});

export const config = cleanEnv(process.env, {
	AI_GATEWAY_API_KEY: nonEmptyString({
		desc: "Vercel AI Gateway API key",
		testDefault: "test-ai-gateway-key",
	}),
	BOLT_MODEL_ID: nonEmptyString({
		default: "alibaba/qwen3.8-max",
		desc: "Model ID served by the Vercel AI Gateway",
	}),
	BOLT_REPLY_GATE_MODEL_ID: nonEmptyString({
		default: "openai/gpt-5.4-nano",
		desc: "Fast model used to decide whether Bolt should reply to an unmentioned Slack message",
	}),
	BOLT_SANDBOX_IMAGE: nonEmptyString({
		default: defaultSandboxImage,
		desc: "OCI image used for Bolt sandboxes",
	}),
	DATABASE_URL: url({
		desc: "PostgreSQL connection URL",
		default: "postgresql://bolt:bolt@localhost:5432/bolt",
		testDefault: "postgresql://localhost:5432/bolt_test",
	}),
	DAYTONA_API_KEY: nonEmptyString({
		desc: "Daytona API key used to create Bolt sandboxes",
		testDefault: "test-daytona-api-key",
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
		default: "3658873",
		testDefault: "test-github-app-id",
	}),
	GITHUB_APP_PRIVATE_KEY: nonEmptyString({
		desc: "GitHub App private key",
		testDefault: "test-github-private-key",
	}),
	GITHUB_INSTALLATION_ID: num({
		desc: "GitHub App installation ID",
		default: 130950814,
		testDefault: 12_345,
	}),
	SENTRY_DSN: url({
		default: undefined,
		desc: "Sentry project DSN",
	}),
	SLACK_BOT_TOKEN: nonEmptyString({
		desc: "Slack bot OAuth token",
		testDefault: "xoxb-test",
	}),
	SLACK_APP_TOKEN: nonEmptyString({
		default: undefined,
		desc: "Slack app-level token used for Socket Mode in development",
		requiredWhen: () => process.env.NODE_ENV === "development",
	}),
	SLACK_SIGNING_SECRET: nonEmptyString({
		default: undefined,
		desc: "Slack webhook signing secret used outside development",
		requiredWhen: () => process.env.NODE_ENV !== "development",
		testDefault: "test-slack-signing-secret",
	}),
});
