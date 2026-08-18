import type { SpanOutputProcessor } from "@mastra/core/observability";

// Mastra snapshots the entire RequestContext onto spans, while requestContextKeys only copies selected values into metadata and its built-in sensitive-data filter does not inspect requestContext.
// Remove the snapshot so channel adapters cannot leak secrets.
export const requestContextFilter = {
	name: "request-context-filter",
	process(span) {
		if (span) span.requestContext = undefined;
		return span;
	},
	shutdown: () => Promise.resolve(),
} satisfies SpanOutputProcessor;
