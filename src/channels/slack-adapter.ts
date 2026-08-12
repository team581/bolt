import { createSlackAdapter } from "@chat-adapter/slack";
import { config, isDevelopment } from "../config.ts";
import { createSlackLogger } from "./slack-logger.ts";

const sharedOptions = {
	logger: createSlackLogger(),
	// Tool calls can outlive Slack's native stream. Chat SDK does not yet recover
	// message_not_in_streaming_state after native content has been rendered:
	// https://github.com/vercel/chat/issues/671
	nativeStreaming: false,
} as const;

export function createConfiguredSlackAdapter(): ReturnType<typeof createSlackAdapter> {
	return createSlackAdapter(
		isDevelopment
			? {
					mode: "socket",
					appToken: config.SLACK_APP_TOKEN,
					botToken: config.SLACK_BOT_TOKEN,
					...sharedOptions,
				}
			: {
					mode: "webhook",
					botToken: config.SLACK_BOT_TOKEN,
					signingSecret: config.SLACK_SIGNING_SECRET,
					...sharedOptions,
				},
	);
}
