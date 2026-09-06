import type { PluginSandbox } from "@sentry/junior-plugin-api";
import { describe, expect, it, vi } from "vitest";
import { injectGitHubCredentials, prepareBoltSandbox } from "../app/plugins/bolt-runtime.ts";
import { parseServiceAccountKey } from "../src/config.ts";

const runtimeConfig = {
	GCS_SERVICE_ACCOUNT_KEY: { client_email: "bolt@example.com" },
	GITHUB_APP_BOT_EMAIL: "bolt@example.com",
	GITHUB_APP_BOT_NAME: "Bolt",
};

function createSandbox(
	run: PluginSandbox["run"],
	writeFile: PluginSandbox["writeFile"] = vi.fn(() => Promise.resolve()),
): PluginSandbox {
	return {
		juniorRoot: "/workspace/.junior",
		readFile: vi.fn(() => Promise.resolve(null)),
		root: "/workspace",
		run,
		writeFile,
	};
}

describe("GitHub command credentials", () => {
	it("injects a fresh installation token only for Bash", async () => {
		const set = vi.fn();
		const createToken = vi.fn(() => Promise.resolve("token"));

		const env = {
			get(): undefined {},
			set: (key: string, value: string) => {
				set(key, value);
			},
		};
		await injectGitHubCredentials({ env, tool: { input: {}, name: "readFile" } }, createToken);
		expect(createToken).not.toHaveBeenCalled();

		await injectGitHubCredentials({ env, tool: { input: {}, name: "bash" } }, createToken);
		expect(createToken).toHaveBeenCalledOnce();
		expect(set).toHaveBeenCalledWith("GH_TOKEN", "token");
		expect(set).toHaveBeenCalledWith("GITHUB_TOKEN", "token");
	});
});

describe("environment validation", () => {
	it("accepts JSON and rejects malformed GCS service-account credentials", () => {
		expect(
			parseServiceAccountKey(
				'{"client_email":"bolt@example.com","private_key":"key","token_uri":"https://oauth2.googleapis.com/token"}',
			),
		).toEqual({
			client_email: "bolt@example.com",
			private_key: "key",
			token_uri: "https://oauth2.googleapis.com/token",
		});
		expect(() => parseServiceAccountKey("not-a-service-account")).toThrow(
			"GCS_SERVICE_ACCOUNT_KEY must contain a Google service-account credential",
		);
		expect(() => parseServiceAccountKey("{}")).toThrow(
			"GCS_SERVICE_ACCOUNT_KEY must contain a Google service-account credential",
		);
	});
});

describe("Bolt sandbox preparation", () => {
	it("keeps a dirty repository and an existing Fetch mount untouched", async () => {
		const run = vi.fn<PluginSandbox["run"]>(({ args, cmd }) => {
			if (cmd === "test") return Promise.resolve({ exitCode: 0, stderr: "", stdout: "" });
			if (cmd === "git" && args?.includes("--porcelain") === true) {
				return Promise.resolve({ exitCode: 0, stderr: "", stdout: " M Robot.java\n" });
			}
			return Promise.resolve({ exitCode: 0, stderr: "", stdout: "" });
		});
		const writeFile = vi.fn(() => Promise.resolve());

		await prepareBoltSandbox(createSandbox(run, writeFile), runtimeConfig);

		expect(run).toHaveBeenCalledWith({
			args: ["config", "--global", "--replace-all", "credential.https://github.com.helper", ""],
			cmd: "git",
		});
		expect(run.mock.calls.some(([input]) => input.cmd === "git" && input.args?.includes("pull") === true)).toBe(false);
		expect(run.mock.calls.some(([input]) => input.cmd === "gcsfuse")).toBe(false);
		expect(writeFile).not.toHaveBeenCalled();
	});

	it("deletes the GCS key when mounting fails", async () => {
		const run = vi.fn<PluginSandbox["run"]>(({ args, cmd }) => {
			if (cmd === "test") return Promise.resolve({ exitCode: 0, stderr: "", stdout: "" });
			if (cmd === "git" && args?.includes("--porcelain") === true) {
				return Promise.resolve({ exitCode: 0, stderr: "", stdout: "" });
			}
			if (cmd === "mountpoint") return Promise.resolve({ exitCode: 1, stderr: "", stdout: "" });
			if (cmd === "gcsfuse") return Promise.resolve({ exitCode: 1, stderr: "mount failed", stdout: "" });
			return Promise.resolve({ exitCode: 0, stderr: "", stdout: "" });
		});
		const writeFile = vi.fn(() => Promise.resolve());

		await expect(prepareBoltSandbox(createSandbox(run, writeFile), runtimeConfig)).rejects.toThrow("mount failed");

		expect(writeFile).toHaveBeenCalledWith(
			expect.objectContaining({ mode: 0o600, path: "/tmp/bolt-fetch-service-account.json" }),
		);
		expect(run).toHaveBeenCalledWith({
			args: ["-f", "/tmp/bolt-fetch-service-account.json"],
			cmd: "rm",
			sudo: true,
		});
	});
});
