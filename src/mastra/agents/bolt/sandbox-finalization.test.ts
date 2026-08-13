import { RequestContext } from "@mastra/core/request-context";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
	createToken: vi.fn(() => Promise.resolve("github-token")),
	revokeToken: vi.fn(() => Promise.resolve()),
	stop: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../../github-app.ts", () => ({
	createGitHubInstallationToken: mocks.createToken,
	revokeGitHubInstallationToken: mocks.revokeToken,
}));

vi.mock("@mastra/daytona", () => ({
	DaytonaSandbox: class {
		executeCommand() {
			return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
		}

		mount() {
			return Promise.resolve({ success: true });
		}

		stop() {
			return mocks.stop();
		}
	},
}));

import { resolveBoltSandbox, withBoltSandboxContext } from "./sandbox.ts";

describe("programmatic sandbox finalization", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it.each([
		["success", undefined],
		["failure", new Error("failed")],
		["cancellation", new DOMException("canceled", "AbortError")],
	] as const)("cleans up after %s", async (_name, failure) => {
		const requestContext = new RequestContext();
		const run = withBoltSandboxContext({
			threadId: "slack:C123:200.000",
			requestContext,
			run: async () => {
				await resolveBoltSandbox(requestContext);
				if (failure !== undefined) throw failure;
			},
		});
		if (failure === undefined) await expect(run).resolves.toBeUndefined();
		else await expect(run).rejects.toBe(failure);

		expect(mocks.stop).toHaveBeenCalledOnce();
		expect(mocks.revokeToken).toHaveBeenCalledOnce();
	});

	it("keeps the sandbox alive until queued work completes", async () => {
		const requestContext = new RequestContext();
		let completeQueuedWork: (() => void) | undefined;
		const queuedWork = new Promise<void>((resolve) => {
			completeQueuedWork = resolve;
		});
		const run = withBoltSandboxContext({
			threadId: "slack:C123:200.000",
			requestContext,
			run: async () => {
				await resolveBoltSandbox(requestContext);
				await queuedWork;
			},
		});
		await vi.waitFor(() => {
			expect(mocks.createToken).toHaveBeenCalledOnce();
		});
		expect(mocks.stop).not.toHaveBeenCalled();
		completeQueuedWork?.();
		await run;
		expect(mocks.stop).toHaveBeenCalledOnce();
		expect(mocks.revokeToken).toHaveBeenCalledOnce();
	});
});
