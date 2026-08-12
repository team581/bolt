import { RequestContext } from "@mastra/core/request-context";
import { describe, expect, it } from "vite-plus/test";
import { resolveBoltSandbox, sandboxIdentity, sanitizeFilename, slackConversationId } from "./sandbox.ts";

describe("Bolt Daytona sandbox", () => {
	it("creates stable Slack conversation and sandbox identities", () => {
		expect(slackConversationId("slack:C123:456.789")).toBe("slack:slack:C123:456.789");
		expect(sandboxIdentity("slack:slack:C123:456.789")).toBe(sandboxIdentity("slack:slack:C123:456.789"));
		expect(sandboxIdentity("slack:slack:C123:456.789")).not.toBe(sandboxIdentity("slack:slack:C123:other"));
	});

	it("sanitizes uploaded filenames", () => {
		expect(sanitizeFilename("match 1/../auto?.wpilog")).toBe("match_1_.._auto_.wpilog");
	});

	it("requires durable Slack context to resolve a sandbox", async () => {
		await expect(resolveBoltSandbox(new RequestContext())).rejects.toThrow(
			"Bolt's Slack thread is not available for this request.",
		);
	});
});
