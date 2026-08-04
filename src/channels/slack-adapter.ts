import { createSlackAdapter } from "@chat-adapter/slack";
import type { Attachment } from "chat";

export const slackAdapter = createSlackAdapter({
	loadingMessages: ["Thinking…", "Working on your request…", "Checking the relevant context…"],
});

export async function fetchSlackMessageAttachments(threadId: string, messageId: string): Promise<Attachment[]> {
	const message = await slackAdapter.fetchMessage(threadId, messageId);
	if (!message) throw new Error(`Slack message ${messageId} was not found in ${threadId}.`);
	return message.attachments;
}
