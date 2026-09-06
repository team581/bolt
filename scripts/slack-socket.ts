import { createHmac } from "node:crypto";
import { SocketModeClient } from "@slack/socket-mode";

interface SocketEvent {
	ack(response?: Record<string, unknown>): Promise<void>;
	body: Record<string, unknown>;
	type: string;
}

function requiredEnvironmentVariable(name: string): string {
	const value = process.env[name]?.trim();
	if (value === undefined || value.length === 0) {
		throw new Error(`${name} is required to start Slack Socket Mode`);
	}
	return value;
}

function serializeEvent(
	eventType: string,
	body: Record<string, unknown>,
): {
	body: string;
	contentType: string;
} {
	if (eventType === "slash_commands") {
		const params = new URLSearchParams();
		for (const [key, value] of Object.entries(body)) {
			if (typeof value === "string") params.set(key, value);
		}
		return {
			body: params.toString(),
			contentType: "application/x-www-form-urlencoded",
		};
	}

	if (eventType === "interactive") {
		return {
			body: new URLSearchParams({ payload: JSON.stringify(body) }).toString(),
			contentType: "application/x-www-form-urlencoded",
		};
	}

	return { body: JSON.stringify(body), contentType: "application/json" };
}

function slackSignature(signingSecret: string, timestamp: string, body: string): string {
	return `v0=${createHmac("sha256", signingSecret).update(`v0:${timestamp}:${body}`).digest("hex")}`;
}

const appToken = requiredEnvironmentVariable("SLACK_APP_TOKEN");
const signingSecret = requiredEnvironmentVariable("SLACK_SIGNING_SECRET");
const configuredBaseUrl = process.env.JUNIOR_BASE_URL?.trim();
const baseUrl =
	configuredBaseUrl === undefined || configuredBaseUrl.length === 0 ? "http://localhost:3000" : configuredBaseUrl;
const webhookUrl = new URL("/api/webhooks/slack", baseUrl);
const slack = new SocketModeClient({ appToken });

slack.on("slack_event", (event: SocketEvent) => {
	void (async () => {
		await event.ack();

		const payload = serializeEvent(event.type, event.body);
		const timestamp = Math.floor(Date.now() / 1000).toString();
		const response = await fetch(webhookUrl, {
			body: payload.body,
			headers: {
				"content-type": payload.contentType,
				"x-slack-request-timestamp": timestamp,
				"x-slack-signature": slackSignature(signingSecret, timestamp, payload.body),
			},
			method: "POST",
		});
		if (!response.ok) {
			console.error("Failed to forward Slack event", {
				status: response.status,
				type: event.body.type,
			});
		}
	})().catch((error: unknown) => {
		console.error("Failed to forward Slack event", error);
	});
});

await slack.start();
console.log(`Slack Socket Mode is forwarding signed events to ${webhookUrl}`);

await new Promise<void>((resolve) => {
	for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, resolve);
});
await slack.disconnect();
