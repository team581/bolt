import { RequestContext } from "@mastra/core/request-context";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
	createToken: vi.fn(() => Promise.resolve("github-token")),
	executeCommand: vi.fn((command: string) =>
		Promise.resolve({ exitCode: command === "mountpoint" ? 32 : 0, stdout: "", stderr: "" }),
	),
	mount: vi.fn(() => Promise.resolve({ success: true })),
	revokeToken: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../../github-app.ts", () => ({
	createGitHubInstallationToken: mocks.createToken,
	revokeGitHubInstallationToken: mocks.revokeToken,
}));

vi.mock("../../../sentry.ts", () => ({ reportError: vi.fn() }));

vi.mock("@mastra/daytona", () => ({
	DaytonaSandbox: class {
		executeCommand(command: string) {
			return mocks.executeCommand(command);
		}

		mount() {
			return mocks.mount();
		}
	},
}));

import { resolveBoltSandbox, withBoltSandbox } from "./sandbox.ts";
import workspace from "./workspace.ts";

const THREAD_ID = "slack:C123:200.000";
const SETUP_SUCCESS = { exitCode: 0, stdout: "", stderr: "" };

describe("background sandbox preparation", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.executeCommand.mockImplementation((command) =>
			Promise.resolve({ ...SETUP_SUCCESS, exitCode: command === "mountpoint" ? 32 : 0 }),
		);
	});

	it("does not resolve the sandbox while constructing workspace instructions", async () => {
		await workspace.getInstructionsAsync({ requestContext: new RequestContext() });

		expect(mocks.createToken).not.toHaveBeenCalled();
	});

	it("starts the agent handler without waiting for setup", async () => {
		const setup = Promise.withResolvers<typeof SETUP_SUCCESS>();
		mocks.executeCommand.mockReturnValueOnce(setup.promise);
		const handlerStarted = Promise.withResolvers<void>();
		const requestContext = new RequestContext();
		const run = withBoltSandbox({
			threadId: THREAD_ID,
			messages: [],
			requestContext,
			run: () => {
				handlerStarted.resolve();
				return Promise.resolve();
			},
		});

		await handlerStarted.promise;
		expect(mocks.executeCommand).toHaveBeenCalledOnce();
		expect(mocks.revokeToken).not.toHaveBeenCalled();

		setup.resolve(SETUP_SUCCESS);
		await run;
		expect(mocks.revokeToken).toHaveBeenCalledOnce();
	});

	it("makes sandbox tools wait for the shared setup", async () => {
		const setup = Promise.withResolvers<typeof SETUP_SUCCESS>();
		mocks.executeCommand.mockReturnValueOnce(setup.promise);
		const toolStarted = Promise.withResolvers<void>();
		const requestContext = new RequestContext();
		let toolResolved = false;
		const run = withBoltSandbox({
			threadId: THREAD_ID,
			messages: [],
			requestContext,
			run: async () => {
				const sandbox = resolveBoltSandbox(requestContext).then(() => {
					toolResolved = true;
				});
				toolStarted.resolve();
				await sandbox;
			},
		});

		await toolStarted.promise;
		expect(toolResolved).toBe(false);

		setup.resolve(SETUP_SUCCESS);
		await run;
		expect(toolResolved).toBe(true);
	});

	it("deduplicates concurrent setup for the same sandbox", async () => {
		const setup = Promise.withResolvers<typeof SETUP_SUCCESS>();
		mocks.executeCommand.mockReturnValueOnce(setup.promise);
		const createRun = () =>
			withBoltSandbox({
				threadId: THREAD_ID,
				messages: [],
				requestContext: new RequestContext(),
				run: () => Promise.resolve(),
			});

		const runs = [createRun(), createRun()];
		await vi.waitFor(() => {
			expect(mocks.createToken).toHaveBeenCalledTimes(2);
		});
		expect(mocks.executeCommand).toHaveBeenCalledOnce();

		setup.resolve(SETUP_SUCCESS);
		await Promise.all(runs);

		expect(mocks.mount).toHaveBeenCalledOnce();
		expect(mocks.revokeToken).toHaveBeenCalledTimes(2);
	});

	it("does not remount an existing Fetch filesystem", async () => {
		mocks.executeCommand.mockResolvedValue(SETUP_SUCCESS);

		await withBoltSandbox({
			threadId: THREAD_ID,
			messages: [],
			requestContext: new RequestContext(),
			run: () => Promise.resolve(),
		});

		expect(mocks.mount).not.toHaveBeenCalled();
	});
});
