import type { Sandbox, SandboxExecParams } from "modal";
import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_EXEC_TIMEOUT_MS, modal } from "./modal.ts";

function fakeSandbox(): { sandbox: Sandbox; execParams: SandboxExecParams[] } {
	const execParams: SandboxExecParams[] = [];
	const sandbox = {
		exec: async (_command: string[], params: SandboxExecParams) => {
			execParams.push(params);
			return {
				stderr: { readText: async () => "" },
				stdout: { readText: async () => "" },
				wait: async () => 0,
			};
		},
		poll: async () => null,
	} as unknown as Sandbox;
	return { sandbox, execParams };
}

describe("Modal sandbox adapter", () => {
	it("applies a bounded default exec timeout", async () => {
		const { sandbox, execParams } = fakeSandbox();
		const session = await modal(sandbox).createSessionEnv({ id: "default-timeout" });

		await session.exec("true");

		expect(execParams[0]?.timeoutMs).toBe(DEFAULT_EXEC_TIMEOUT_MS);
	});

	it("preserves an explicit exec timeout", async () => {
		const { sandbox, execParams } = fakeSandbox();
		const session = await modal(sandbox).createSessionEnv({ id: "explicit-timeout" });

		await session.exec("true", { timeoutMs: 1_234 });

		expect(execParams[0]?.timeoutMs).toBe(1_234);
	});
});
