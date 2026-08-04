// flue-blueprint: tooling/sentry@1

import { createOpenTelemetryInstrumentation } from "@flue/opentelemetry";
import { type FlueObservation, instrument } from "@flue/runtime";
import * as Sentry from "@sentry/node";

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
	dsn: process.env.SENTRY_DSN,
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
			if (event.submissionId) capturedFailedSubmissions.add(event.submissionId);
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

function captureTerminalFailure(error: unknown, tags: Record<string, string>, context?: Record<string, unknown>): void {
	Sentry.withScope((scope) => {
		scope.setTags(tags);
		scope.setLevel("error");
		if (context) scope.setContext("flue.incident", context);
		Sentry.captureException(toError(error));
	});
}

function correlationTags(event: FlueObservation): Record<string, string> {
	const tags: Record<string, string> = {};
	if (event.instanceId) tags["flue.instance.id"] = event.instanceId;
	if (event.agentName) tags["flue.agent.name"] = event.agentName;
	if (event.conversationId) tags["flue.conversation.id"] = event.conversationId;
	if (event.submissionId) tags["flue.submission.id"] = event.submissionId;
	if (event.harness) tags["flue.harness"] = event.harness;
	if (event.session) tags["flue.session"] = event.session;
	if (event.parentSession) tags["flue.parent_session"] = event.parentSession;
	if (event.operationId) tags["flue.operation.id"] = event.operationId;
	if (event.taskId) tags["flue.task.id"] = event.taskId;
	return tags;
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
	if (value && typeof value === "object") {
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
