import { cleanEnv, email, makeExactValidator, makeValidator, num, url } from "envalid";

const nonEmptyString = makeValidator<string>((input) => {
	if (!input.trim()) throw new Error("Expected a non-empty string");
	return input;
});

export function parseServiceAccountKey(input: string): object {
	let parsed: unknown;
	try {
		parsed = JSON.parse(input);
	} catch {
		parsed = undefined;
	}
	// A fixed message, since envalid's json() echoes the raw value (the private key) in its error.
	if (typeof parsed !== "object" || parsed === null) throw new Error("Expected a Google service-account key as JSON");
	return parsed;
}

const serviceAccountKey = makeExactValidator<object>(parseServiceAccountKey);

const environment = { ...process.env };
if (environment.JUNIOR_BASE_URL === undefined || environment.JUNIOR_BASE_URL.trim() === "") {
	delete environment.JUNIOR_BASE_URL;
}

export const config = cleanEnv(environment, {
	BOLT_MODEL_ID: nonEmptyString({
		default: "alibaba/qwen3.8-max",
		desc: "Model ID served by the Vercel AI Gateway",
	}),
	BOLT_REPLY_GATE_MODEL_ID: nonEmptyString({
		default: "openai/gpt-5.6-luna",
		desc: "Fast model used to decide whether Bolt should reply to an unmentioned Slack message",
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
	GCS_SERVICE_ACCOUNT_KEY: serviceAccountKey({
		desc: "Service account key JSON with read-only access to the Fetch GCS bucket",
	}),
	GOOGLE_WORKSPACE_SERVICE_ACCOUNT_KEY: serviceAccountKey({
		desc: "Service account key JSON for read-only Google Workspace MCP access",
	}),
	JUNIOR_BASE_URL: url({
		default: undefined,
		desc: "Canonical public URL for Junior callbacks and dashboard authentication",
	}),
});
