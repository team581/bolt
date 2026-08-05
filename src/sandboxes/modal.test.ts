import type { Sandbox, SandboxExecParams } from "modal";
import { Temporal } from "temporal-polyfill";
import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_EXEC_TIMEOUT, modal } from "./modal.ts";

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

		expect(execParams[0]?.timeoutMs).toBe(DEFAULT_EXEC_TIMEOUT.total("milliseconds"));
	});

	it("preserves an explicit exec timeout", async () => {
		const { sandbox, execParams } = fakeSandbox();
		const session = await modal(sandbox).createSessionEnv({ id: "explicit-timeout" });

		const timeout = Temporal.Duration.from({ milliseconds: 1_234 });
		await session.exec("true", { timeoutMs: timeout.total("milliseconds") });

		expect(execParams[0]?.timeoutMs).toBe(timeout.total("milliseconds"));
	});
});
