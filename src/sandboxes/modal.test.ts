import type { Sandbox, SandboxExecParams } from "modal";
import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_EXEC_TIMEOUT, modal } from "./modal.ts";

function fakeSandbox(): { sandbox: Sandbox; execParams: SandboxExecParams[] } {
	const execParams: SandboxExecParams[] = [];
	const sandbox = {
		exec: (_command: string[], params: SandboxExecParams) => {
			execParams.push(params);
			return Promise.resolve({
				stderr: { readText: () => Promise.resolve("") },
				stdout: { readText: () => Promise.resolve("") },
				wait: () => Promise.resolve(0),
			});
		},
		poll: () => Promise.resolve(null),
	} as unknown as Sandbox;
	return { sandbox, execParams };
}

describe("Modal sandbox adapter", () => {
	it("applies a bounded default exec timeout", async () => {
		const { sandbox, execParams } = fakeSandbox();
		const session = await modal(sandbox).createSandbox({ id: "default-timeout" });

		await session.exec("true");

		expect(execParams[0]?.timeoutMs).toBe(DEFAULT_EXEC_TIMEOUT.total("milliseconds"));
	});

	it("preserves an explicit exec timeout", async () => {
		const { sandbox, execParams } = fakeSandbox();
		const session = await modal(sandbox).createSandbox({ id: "explicit-timeout" });

		const timeout = Temporal.Duration.from({ milliseconds: 1_234 });
		await session.exec("true", { timeoutMs: timeout.total("milliseconds") });

		expect(execParams[0]?.timeoutMs).toBe(timeout.total("milliseconds"));
	});

	it("merges session environment variables into every command", async () => {
		const { sandbox, execParams } = fakeSandbox();
		const session = await modal(sandbox, {
			env: { GH_TOKEN: "fresh-token", SHARED: "default" },
		}).createSandbox({ id: "session-env" });

		await session.exec("true", { env: { COMMAND: "value", SHARED: "override" } });

		expect(execParams[0]?.env).toEqual({
			COMMAND: "value",
			GH_TOKEN: "fresh-token",
			SHARED: "override",
		});
	});
});
