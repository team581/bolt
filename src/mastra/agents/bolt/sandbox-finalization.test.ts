import { RequestContext } from "@mastra/core/request-context";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
	createToken: vi.fn(() => Promise.resolve("github-token")),
	executeCommand: vi.fn((command: string) =>
		Promise.resolve({ exitCode: command === "mountpoint" ? 32 : 0, stdout: "", stderr: "" }),
	),
	revokeToken: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../../github-app.ts", () => ({
	createGitHubInstallationToken: mocks.createToken,
	revokeGitHubInstallationToken: mocks.revokeToken,
}));

vi.mock("@mastra/daytona", () => ({
	DaytonaSandbox: class {
		executeCommand(command: string) {
			return mocks.executeCommand(command);
		}

		mount() {
			return Promise.resolve({ success: true });
		}
	},
}));

import { resolveBoltSandbox, withBoltSandboxContext } from "./sandbox.ts";

function runWithSandbox(run: () => Promise<void> = () => Promise.resolve()): Promise<void> {
	const requestContext = new RequestContext();
	return withBoltSandboxContext({
		threadId: "slack:C123:200.000",
		requestContext,
		run: async () => {
			await resolveBoltSandbox(requestContext);
			await run();
		},
	});
}

describe("programmatic sandbox finalization", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("keeps the sandbox credentials alive until completed work settles", async () => {
		const queuedWork = Promise.withResolvers<void>();
		const run = runWithSandbox(() => queuedWork.promise);
		await vi.waitFor(() => {
			expect(mocks.createToken).toHaveBeenCalledOnce();
		});
		expect(mocks.revokeToken).not.toHaveBeenCalled();
		queuedWork.resolve();
		await run;
		expect(mocks.revokeToken).toHaveBeenCalledOnce();
	});

	it("revokes the sandbox credentials when completed work fails", async () => {
		const failure = new Error("failed");

		await expect(runWithSandbox(() => Promise.reject(failure))).rejects.toBe(failure);

		expect(mocks.revokeToken).toHaveBeenCalledOnce();
	});

	it("revokes the sandbox credentials when setup fails", async () => {
		mocks.executeCommand.mockResolvedValueOnce({ exitCode: 1, stdout: "", stderr: "setup failed" });

		await expect(runWithSandbox()).rejects.toThrow("Sandbox setup failed");

		expect(mocks.revokeToken).toHaveBeenCalledOnce();
	});

	it("does not run application-level GCS key cleanup after mounting", async () => {
		await runWithSandbox();

		expect(mocks.executeCommand).toHaveBeenCalledTimes(2);
		expect(mocks.executeCommand).not.toHaveBeenCalledWith(expect.stringContaining("gcs-key"));
	});
});
