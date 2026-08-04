import { createSlackAdapter } from "@chat-adapter/slack";
import type { Attachment } from "chat";

export const slackAdapter = createSlackAdapter({
	agentView: true,
	loadingMessages: ["Thinking…", "Working on your request…", "Checking the relevant context…"],
	suggestedPrompts: {
		title: "How can Bolt help?",
		prompts: [
			{ title: "Ask about code", message: "Help me understand some robot code" },
			{ title: "Debug a log", message: "Help me debug a WPILOG file" },
			{ title: "Manage GitHub work", message: "Help me with our GitHub project" },
		],
	},
});

export async function fetchSlackMessageAttachments(threadId: string, messageId: string): Promise<Attachment[]> {
	const message = await slackAdapter.fetchMessage(threadId, messageId);
	if (!message) throw new Error(`Slack message ${messageId} was not found in ${threadId}.`);
	return message.attachments;
}
