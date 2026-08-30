import { ConsoleLogger } from "chat";
import type { Logger } from "chat";
import { reportError } from "../sentry.ts";

export function createSlackLogger(): Logger {
	return new SentrySlackLogger("info", "chat-sdk:slack");
}

class SentrySlackLogger extends ConsoleLogger {
	override debug(message: string, ...args: unknown[]): void {
		if (
			message.startsWith("Slack API: chat.postMessage (plan)") ||
			message.startsWith("Slack API: chat.update (plan)") ||
			message.startsWith("Slack API: chat.update response") ||
			message.startsWith("Slack: using fallback stream")
		) {
			super.info(`[render diagnostic] ${message}`, ...args);
			return;
		}
		super.debug(message, ...args);
	}

	override warn(message: string, ...args: unknown[]): void {
		super.warn(message, ...args);
		const context = args[0];
		if (typeof context === "object" && context !== null && "error" in context) {
			reportError(context.error, `Slack adapter warning: ${message}`);
		}
	}
}
