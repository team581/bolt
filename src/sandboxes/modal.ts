// flue-blueprint: sandbox/modal@1
/**
 * Modal adapter for Flue.
 *
 * Wraps an already-initialized Modal Sandbox into Flue's SandboxFactory
 * interface. The user creates and configures the Sandbox using the Modal
 * JS SDK directly — Flue just adapts it.
 */
import { sandboxFromDriver, SandboxDiedError } from "@flue/runtime";
import type { FileStat, SandboxDriver, SandboxFactory } from "@flue/runtime";
import type { Sandbox as ModalSandbox } from "modal";

export interface ModalAdapterOptions {
	/**
	 * Default working directory for `exec()` calls when the caller doesn't
	 * pass one. Defaults to "/".
	 */
	cwd?: string;
	/** Environment variables included in every `exec()` call. */
	env?: Record<string, string>;
}

function shellQuote(value: string): string {
	return `'${value.replaceAll("'", `'\\''`)}'`;
}

const SANDBOX_LIVENESS_POLL = Temporal.Duration.from({ seconds: 5 });
const PROBE_SILENCE = Temporal.Duration.from({ seconds: 10 });
export const DEFAULT_EXEC_TIMEOUT = Temporal.Duration.from({ minutes: 10 });

function raceSandboxDeath<T>(sandbox: ModalSandbox, operation: string, call: Promise<T>): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		let settled = false;
		let pollTimer: ReturnType<typeof setTimeout> | undefined;
		let silenceTimer: ReturnType<typeof setTimeout> | undefined;

		const settle = (complete: () => void): void => {
			if (settled) return;
			settled = true;
			clearTimeout(pollTimer);
			clearTimeout(silenceTimer);
			complete();
		};

		const probe = async (): Promise<void> => {
			silenceTimer = setTimeout(() => {
				settle(() => {
					reject(new SandboxDiedError({ operation, reason: "probe_silent" }));
				});
			}, PROBE_SILENCE.total("milliseconds"));
			let exitCode: number | null;
			try {
				exitCode = await sandbox.poll();
			} catch {
				if (settled) return;
				clearTimeout(silenceTimer);
				pollTimer = setTimeout(() => {
					void probe();
				}, SANDBOX_LIVENESS_POLL.total("milliseconds"));
				return;
			}
			if (settled) return;
			clearTimeout(silenceTimer);
			if (exitCode === null) {
				pollTimer = setTimeout(() => {
					void probe();
				}, SANDBOX_LIVENESS_POLL.total("milliseconds"));
			} else {
				settle(() => {
					reject(new SandboxDiedError({ operation, reason: "stopped" }));
				});
			}
		};
		pollTimer = setTimeout(() => {
			void probe();
		}, SANDBOX_LIVENESS_POLL.total("milliseconds"));

		const settleCall = async (): Promise<void> => {
			try {
				const value = await call;
				settle(() => {
					resolve(value);
				});
			} catch (error) {
				const rejection =
					error instanceof Error ? error : new Error("Modal sandbox operation failed.", { cause: error });
				settle(() => {
					reject(rejection);
				});
			}
		};
		void settleCall();
	});
}

class ModalSandboxDriver implements SandboxDriver {
	constructor(
		private sandbox: ModalSandbox,
		private env?: Record<string, string>,
	) {}

	private guarded<T>(operation: string, call: Promise<T>): Promise<T> {
		return raceSandboxDeath(this.sandbox, operation, call);
	}

	readFile(path: string): Promise<string> {
		return this.guarded("readFile", this.sandbox.filesystem.readText(path));
	}

	readFileBuffer(path: string): Promise<Uint8Array> {
		return this.guarded("readFile", this.sandbox.filesystem.readBytes(path));
	}

	async writeFile(path: string, content: string | Uint8Array): Promise<void> {
		await this.guarded(
			"writeFile",
			typeof content === "string"
				? this.sandbox.filesystem.writeText(content, path)
				: this.sandbox.filesystem.writeBytes(content, path),
		);
	}

	async stat(path: string): Promise<FileStat> {
		const result = await this.runShell("stat", `stat -c '%F|%s|%Y' ${shellQuote(path)} 2>/dev/null`);
		if (result.exitCode !== 0 || !result.stdout.trim()) {
			throw new Error(
				`[flue:modal] stat failed for ${path}: ` + (result.stderr || result.stdout || `exit ${result.exitCode}`),
			);
		}
		const fields = result.stdout.trim().split("|");
		const [type, sizeStr, mtimeStr] = fields;
		const size = Number(sizeStr);
		const mtimeSecs = Number(mtimeStr);
		const mtime = new Date(mtimeSecs * 1000);
		if (
			fields.length !== 3 ||
			sizeStr === undefined ||
			sizeStr.length === 0 ||
			mtimeStr === undefined ||
			mtimeStr.length === 0 ||
			!Number.isSafeInteger(size) ||
			size < 0 ||
			!Number.isSafeInteger(mtimeSecs) ||
			!Number.isFinite(mtime.getTime())
		) {
			throw new Error(`[flue:modal] malformed stat output for ${path}`);
		}
		return {
			isFile: type === "regular file" || type === "regular empty file",
			isDirectory: type === "directory",
			isSymbolicLink: type === "symbolic link",
			size,
			mtime,
		};
	}

	async readdir(path: string): Promise<string[]> {
		const result = await this.runShell("readdir", `ls -A1 ${shellQuote(path)}`);
		if (result.exitCode !== 0) {
			throw new Error(
				`[flue:modal] readdir failed for ${path}: ` + (result.stderr || result.stdout || `exit ${result.exitCode}`),
			);
		}
		return result.stdout.split("\n").filter((line) => line.length > 0);
	}

	async exists(path: string): Promise<boolean> {
		const result = await this.runShell("exists", `test -e ${shellQuote(path)}`);
		return result.exitCode === 0;
	}

	async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
		const cmd = options?.recursive === true ? `mkdir -p ${shellQuote(path)}` : `mkdir ${shellQuote(path)}`;
		const result = await this.runShell("mkdir", cmd);
		if (result.exitCode !== 0) {
			throw new Error(
				`[flue:modal] mkdir failed for ${path}: ` + (result.stderr || result.stdout || `exit ${result.exitCode}`),
			);
		}
	}

	async rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
		const flags = `${options?.recursive === true ? "r" : ""}${options?.force === true ? "f" : ""}`;
		const flagArg = flags.length > 0 ? ` -${flags}` : "";
		const result = await this.runShell("rm", `rm${flagArg} ${shellQuote(path)}`);
		if (result.exitCode !== 0) {
			throw new Error(
				`[flue:modal] rm failed for ${path}: ` + (result.stderr || result.stdout || `exit ${result.exitCode}`),
			);
		}
	}

	exec(
		command: string,
		options?: {
			cwd?: string;
			env?: Record<string, string>;
			timeoutMs?: number;
			signal?: AbortSignal;
		},
	): Promise<{ stdout: string; stderr: string; exitCode: number }> {
		return this.runShell("exec", command, options);
	}

	private async runShell(
		operation: string,
		command: string,
		options?: {
			cwd?: string;
			env?: Record<string, string>;
			timeoutMs?: number;
			signal?: AbortSignal;
		},
	): Promise<{ stdout: string; stderr: string; exitCode: number }> {
		const proc = await this.guarded(
			operation,
			this.sandbox.exec(["bash", "-lc", command], {
				workdir: options?.cwd,
				env: { ...this.env, ...options?.env },
				timeoutMs: options?.timeoutMs ?? DEFAULT_EXEC_TIMEOUT.total("milliseconds"),
				stdout: "pipe",
				stderr: "pipe",
			}),
		);

		const [stdout, stderr, exitCode] = await this.guarded(
			operation,
			Promise.all([proc.stdout.readText(), proc.stderr.readText(), proc.wait()]),
		);
		return { stdout, stderr, exitCode };
	}
}

export function modal(sandbox: ModalSandbox, options?: ModalAdapterOptions): SandboxFactory {
	return {
		createSandbox() {
			const sandboxCwd = options?.cwd ?? "/";
			const driver = new ModalSandboxDriver(sandbox, options?.env);
			return Promise.resolve(sandboxFromDriver(driver, sandboxCwd));
		},
	};
}
