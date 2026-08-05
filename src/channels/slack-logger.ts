import { ConsoleLogger } from "chat";
import type { Logger } from "chat";
import { reportError } from "../sentry.ts";

export function createSlackLogger(): Logger {
	return new SentrySlackLogger("info", "chat-sdk:slack");
}

class SentrySlackLogger extends ConsoleLogger {
	override warn(message: string, ...args: unknown[]): void {
		super.warn(message, ...args);
		const context = args[0];
		if (context && typeof context === "object" && "error" in context) {
			reportError(context.error, `Slack adapter warning: ${message}`);
		}
	}
}
