import { cleanEnv, email, makeValidator, num, url } from "envalid";

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
	BOLT_SANDBOX_IMAGE: nonEmptyString({
		default: "ghcr.io/team581/bolt-sandbox:latest",
		desc: "OCI image used for Bolt sandboxes",
	}),
	DATABASE_URL: url({
		desc: "PostgreSQL connection URL",
		testDefault: "postgresql://localhost:5432/bolt_test",
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
	MODAL_APP_NAME: nonEmptyString({
		default: "bolt",
		desc: "Modal app that owns Bolt sandboxes",
	}),
	MODAL_TOKEN_ID: nonEmptyString({
		desc: "Modal API token ID",
		testDefault: "test-modal-token-id",
	}),
	MODAL_TOKEN_SECRET: nonEmptyString({
		desc: "Modal API token secret",
		testDefault: "test-modal-token-secret",
	}),
	SENTRY_DSN: url({
		default: undefined,
		desc: "Sentry project DSN",
	}),
	SLACK_BOT_TOKEN: nonEmptyString({
		desc: "Slack bot OAuth token",
		testDefault: "xoxb-test",
	}),
	SLACK_SIGNING_SECRET: nonEmptyString({
		desc: "Slack webhook signing secret",
		testDefault: "test-slack-signing-secret",
	}),
});
