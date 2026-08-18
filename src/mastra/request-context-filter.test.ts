import type { AnySpan } from "@mastra/core/observability";
import { describe, expect, it } from "vite-plus/test";
import { requestContextFilter } from "./request-context-filter.ts";

describe("requestContextFilter", () => {
	it("removes request context before exporting a span", () => {
		const span = {
			requestContext: {
				channel: { adapter: { signingSecret: "secret" } },
			},
		} as unknown as AnySpan;

		expect(requestContextFilter.process(span)).toBe(span);
		expect(span.requestContext).toBeUndefined();
	});
});
