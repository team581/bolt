import { createSlackAdapter } from "@chat-adapter/slack";
import type { Attachment } from "chat";
import { config } from "../config.ts";

export function createConfiguredSlackAdapter(): ReturnType<typeof createSlackAdapter> {
	return createSlackAdapter(
		config.isDevelopment
			? {
					mode: "socket",
					appToken: config.SLACK_APP_TOKEN,
					botToken: config.SLACK_BOT_TOKEN,
				}
			: {
					mode: "webhook",
					botToken: config.SLACK_BOT_TOKEN,
					signingSecret: config.SLACK_SIGNING_SECRET,
				},
	);
}

const slackApiAdapter = createConfiguredSlackAdapter();

export async function fetchSlackMessageAttachments(threadId: string, messageId: string): Promise<Attachment[]> {
	const message = await slackApiAdapter.fetchMessage(threadId, messageId);
	if (!message) throw new Error(`Slack message ${messageId} was not found in ${threadId}.`);
	return message.attachments;
}
