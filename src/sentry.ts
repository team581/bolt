// flue-blueprint: tooling/sentry@1

import { createOpenTelemetryInstrumentation } from "@flue/opentelemetry";
import { type FlueObservation, instrument } from "@flue/runtime";
import * as Sentry from "@sentry/hono/node";
import { config } from "./config.ts";

// Flue already emits one chat span per model turn. Disable Sentry's direct AI SDK
// integrations so that each model call is only reported once.
const SENTRY_AI_PROVIDER_INTEGRATIONS = new Set([
	"Anthropic_AI",
	"OpenAI",
	"Google_GenAI",
	"LangChain",
	"LangGraph",
	"VercelAI",
]);

Sentry.init({
	dsn: config.SENTRY_DSN,
	environment: process.env.NODE_ENV,
	tracesSampleRate: 1,
	traceLifecycle: "stream",
	streamGenAiSpans: true,
	enableLogs: true,
	integrations: (defaults) => defaults.filter((integration) => !SENTRY_AI_PROVIDER_INTEGRATIONS.has(integration.name)),
});

instrument(createOpenTelemetryInstrumentation());

// Remember operation failures so their later settlement events do not create
// duplicate Sentry issues.
const capturedFailedSubmissions = new Set<string>();

instrument({
	key: Symbol.for("flue.sentry.bridge"),
	observe(event) {
		if (event.type === "operation" && event.isError) {
			captureTerminalFailure(event.errorInfo ?? event.error, correlationTags(event), {
				durationMs: event.durationMs,
				operationKind: event.operationKind,
			});
			if (event.submissionId !== undefined && event.submissionId.length > 0) {
				capturedFailedSubmissions.add(event.submissionId);
			}
			return;
		}
		if (event.type === "submission_settled") {
			const alreadyCaptured = capturedFailedSubmissions.delete(event.submissionId);
			if (event.outcome === "failed" && !alreadyCaptured) {
				captureTerminalFailure(event.errorInfo ?? event.error, correlationTags(event));
			}
			return;
		}
		if (event.type === "log") {
			Sentry.logger[event.level](event.message, logAttributes(event));
		}
	},
	interceptor: (_operation, _ctx, next) => next(),
	async dispose() {
		await Sentry.flush(2000);
	},
});

export function reportError(error: unknown, message: string, context?: Record<string, unknown>): void {
	Sentry.withScope((scope) => {
		scope.setLevel("error");
		scope.setContext("application.error", { message, ...context });
		Sentry.captureException(toError(error));
	});
}

function captureTerminalFailure(error: unknown, tags: Record<string, string>, context?: Record<string, unknown>): void {
	Sentry.withScope((scope) => {
		scope.setTags(tags);
		scope.setLevel("error");
		if (context !== undefined) scope.setContext("flue.incident", context);
		Sentry.captureException(toError(error));
	});
}

function correlationTags(event: FlueObservation): Record<string, string> {
	const tags: Record<string, string> = {};
	setOptionalTag(tags, "flue.instance.id", event.instanceId);
	setOptionalTag(tags, "flue.agent.name", event.agentName);
	setOptionalTag(tags, "flue.conversation.id", event.conversationId);
	setOptionalTag(tags, "flue.submission.id", event.submissionId);
	setOptionalTag(tags, "flue.harness", event.harness);
	setOptionalTag(tags, "flue.session", event.session);
	setOptionalTag(tags, "flue.parent_session", event.parentSession);
	setOptionalTag(tags, "flue.operation.id", event.operationId);
	setOptionalTag(tags, "flue.task.id", event.taskId);
	return tags;
}

function setOptionalTag(tags: Record<string, string>, key: string, value: string | undefined): void {
	if (value !== undefined && value.length > 0) tags[key] = value;
}

type LogAttribute = string | number | boolean;

function logAttributes(event: Extract<FlueObservation, { type: "log" }>): Record<string, LogAttribute> {
	const attributes: Record<string, LogAttribute> = {};
	for (const [key, value] of Object.entries(correlationTags(event))) attributes[key] = value;
	for (const [key, value] of Object.entries(event.attributes ?? {})) {
		attributes[`flue.log.${key}`] =
			typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : stringify(value);
	}
	return attributes;
}

function toError(value: unknown): Error {
	if (value instanceof Error) return value;
	if (typeof value === "object" && value !== null) {
		const source = value as { name?: unknown; message?: unknown; stack?: unknown };
		const error = new Error(typeof source.message === "string" ? source.message : stringify(value));
		if (typeof source.name === "string") error.name = source.name;
		if (typeof source.stack === "string") error.stack = source.stack;
		return error;
	}
	return new Error(typeof value === "string" ? value : stringify(value));
}

function stringify(value: unknown): string {
	try {
		return JSON.stringify(value) ?? String(value);
	} catch {
		return String(value);
	}
}
