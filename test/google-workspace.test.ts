import { beforeEach, describe, expect, it, vi } from "vitest";
import { getReadOnlyTools } from "../scripts/generate-google-workspace-tools.ts";

const { connect, listTools, close } = vi.hoisted(() => ({
	connect: vi.fn(),
	listTools: vi.fn(),
	close: vi.fn(),
}));

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
	Client: class {
		connect = connect;
		listTools = listTools;
		close = close;
	},
}));

beforeEach(() => vi.resetAllMocks());

describe("Google Workspace tool snapshot", () => {
	it("collects all pages and includes only explicitly read-only tools, sorted and deduplicated", async () => {
		listTools
			.mockResolvedValueOnce({
				tools: [
					{ name: "z_read", annotations: { readOnlyHint: true } },
					{ name: "write", annotations: { readOnlyHint: false } },
					{ name: "unknown", annotations: { idempotentHint: true } },
					{ name: "unannotated" },
				],
				nextCursor: "page-2",
			})
			.mockResolvedValueOnce({
				tools: [
					{ name: "a_new_read", annotations: { readOnlyHint: true } },
					{ name: "z_read", annotations: { readOnlyHint: true } },
				],
			});

		await expect(getReadOnlyTools("https://example.com/mcp")).resolves.toEqual(["a_new_read", "z_read"]);
		expect(listTools).toHaveBeenLastCalledWith({ cursor: "page-2" });
		expect(close).toHaveBeenCalledOnce();
	});

	it("rejects an empty read-only allowlist because Junior would expose all tools", async () => {
		listTools.mockResolvedValue({ tools: [{ name: "write" }] });
		await expect(getReadOnlyTools("https://example.com/mcp")).rejects.toThrow("no read-only tools found");
		expect(close).toHaveBeenCalledOnce();
	});

	it("rejects a failed later page instead of producing a partial allowlist", async () => {
		listTools
			.mockResolvedValueOnce({
				tools: [{ name: "read", annotations: { readOnlyHint: true } }],
				nextCursor: "page-2",
			})
			.mockRejectedValueOnce(new Error("unavailable"));
		await expect(getReadOnlyTools("https://example.com/mcp")).rejects.toThrow("unavailable");
		expect(close).toHaveBeenCalledOnce();
	});
});
