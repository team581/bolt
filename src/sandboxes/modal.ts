// flue-blueprint: sandbox/modal@1
/**
 * Modal adapter for Flue.
 *
 * Wraps an already-initialized Modal Sandbox into Flue's SandboxFactory
 * interface. The user creates and configures the Sandbox using the Modal
 * JS SDK directly — Flue just adapts it.
 */
import { createSandboxSessionEnv, SandboxDiedError } from "@flue/runtime";
import type { FileStat, SandboxApi, SandboxFactory, SessionEnv } from "@flue/runtime";
import type { Sandbox as ModalSandbox } from "modal";

export interface ModalAdapterOptions {
	/**
	 * Default working directory for `exec()` calls when the caller doesn't
	 * pass one. Defaults to "/".
	 */
	cwd?: string;
}

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

const SANDBOX_LIVENESS_POLL_MS = 5_000;
const PROBE_SILENCE_MS = 10_000;

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

		const probe = (): void => {
			silenceTimer = setTimeout(() => {
				settle(() => reject(new SandboxDiedError({ operation, reason: "probe_silent" })));
			}, PROBE_SILENCE_MS);
			sandbox.poll().then(
				(exitCode) => {
					if (settled) return;
					clearTimeout(silenceTimer);
					if (exitCode !== null) {
						settle(() => reject(new SandboxDiedError({ operation, reason: "stopped" })));
					} else {
						pollTimer = setTimeout(probe, SANDBOX_LIVENESS_POLL_MS);
					}
				},
				() => {
					if (settled) return;
					clearTimeout(silenceTimer);
					pollTimer = setTimeout(probe, SANDBOX_LIVENESS_POLL_MS);
				},
			);
		};
		pollTimer = setTimeout(probe, SANDBOX_LIVENESS_POLL_MS);

		call.then(
			(value) => settle(() => resolve(value)),
			(error: unknown) => settle(() => reject(error)),
		);
	});
}

class ModalSandboxApi implements SandboxApi {
	constructor(private sandbox: ModalSandbox) {}

	private guarded<T>(operation: string, call: Promise<T>): Promise<T> {
		return raceSandboxDeath(this.sandbox, operation, call);
	}

	async readFile(path: string): Promise<string> {
		return this.guarded("readFile", this.sandbox.filesystem.readText(path));
	}

	async readFileBuffer(path: string): Promise<Uint8Array> {
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
			!sizeStr ||
			!mtimeStr ||
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
		const cmd = options?.recursive ? `mkdir -p ${shellQuote(path)}` : `mkdir ${shellQuote(path)}`;
		const result = await this.runShell("mkdir", cmd);
		if (result.exitCode !== 0) {
			throw new Error(
				`[flue:modal] mkdir failed for ${path}: ` + (result.stderr || result.stdout || `exit ${result.exitCode}`),
			);
		}
	}

	async rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
		const flags = `${options?.recursive ? "r" : ""}${options?.force ? "f" : ""}`;
		const flagArg = flags ? ` -${flags}` : "";
		const result = await this.runShell("rm", `rm${flagArg} ${shellQuote(path)}`);
		if (result.exitCode !== 0) {
			throw new Error(
				`[flue:modal] rm failed for ${path}: ` + (result.stderr || result.stdout || `exit ${result.exitCode}`),
			);
		}
	}

	async exec(
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
				env: options?.env,
				timeoutMs: options?.timeoutMs,
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
		async createSessionEnv(): Promise<SessionEnv> {
			const sandboxCwd = options?.cwd ?? "/";
			const api = new ModalSandboxApi(sandbox);
			return createSandboxSessionEnv(api, sandboxCwd);
		},
	};
}
