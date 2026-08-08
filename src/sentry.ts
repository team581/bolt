import * as Sentry from "@sentry/node";

export function reportError(error: unknown, message: string, context?: Record<string, unknown>): void {
	Sentry.withScope((scope) => {
		scope.setLevel("error");
		scope.setContext("application.error", { message, ...context });
		Sentry.captureException(toError(error));
	});
}

function toError(value: unknown): Error {
	if (value instanceof Error) return value;
	return new Error(typeof value === "string" ? value : stringify(value));
}

function stringify(value: unknown): string {
	try {
		return JSON.stringify(value) ?? String(value);
	} catch {
		return String(value);
	}
}
