import { defineJuniorPlugin, type BeforeToolExecuteHookContext, type PluginSandbox } from "@sentry/junior-plugin-api";
import { config } from "../../src/config.ts";
import { createGitHubInstallationToken } from "../../src/github-app.ts";

const FETCH_BUCKET = "fetch_storage";
const GCSFUSE_VERSION = "3.11.2";
const GCS_KEY_PATH = "/tmp/bolt-fetch-service-account.json";
const REPOSITORY_URL = "https://github.com/team581/offseason-2026.git";

type RuntimeConfig = Pick<typeof config, "GCS_SERVICE_ACCOUNT_KEY" | "GITHUB_APP_BOT_EMAIL" | "GITHUB_APP_BOT_NAME">;

async function runOrThrow(
	sandbox: PluginSandbox,
	input: Parameters<PluginSandbox["run"]>[0],
	label: string,
): Promise<void> {
	const result = await sandbox.run(input);
	if (result.exitCode === 0) return;
	throw new Error(`${label} failed: ${result.stderr.trim() || result.stdout.trim() || "unknown error"}`);
}

async function configureGit(sandbox: PluginSandbox, runtimeConfig: RuntimeConfig): Promise<void> {
	await runOrThrow(
		sandbox,
		{ args: ["config", "--global", "user.name", runtimeConfig.GITHUB_APP_BOT_NAME], cmd: "git" },
		"git author-name setup",
	);
	await runOrThrow(
		sandbox,
		{ args: ["config", "--global", "user.email", runtimeConfig.GITHUB_APP_BOT_EMAIL], cmd: "git" },
		"git author-email setup",
	);
	await runOrThrow(
		sandbox,
		{
			args: ["config", "--global", "--replace-all", "credential.https://github.com.helper", ""],
			cmd: "git",
		},
		"GitHub credential-helper reset",
	);
	await runOrThrow(
		sandbox,
		{
			args: ["config", "--global", "--add", "credential.https://github.com.helper", "!gh auth git-credential"],
			cmd: "git",
		},
		"GitHub credential-helper setup",
	);
}

async function prepareRepository(sandbox: PluginSandbox): Promise<void> {
	const repositoryPath = `${sandbox.root}/offseason-2026`;
	const repositoryExists = await sandbox.run({ args: ["-d", `${repositoryPath}/.git`], cmd: "test" });
	if (repositoryExists.exitCode !== 0) {
		await runOrThrow(sandbox, { args: ["clone", REPOSITORY_URL, repositoryPath], cmd: "git" }, "repository clone");
		return;
	}

	const status = await sandbox.run({ args: ["-C", repositoryPath, "status", "--porcelain"], cmd: "git" });
	if (status.exitCode !== 0 || status.stdout.trim() !== "") return;

	await sandbox.run({ args: ["-C", repositoryPath, "pull", "--ff-only", "--quiet"], cmd: "git" });
}

async function mountFetchBucket(sandbox: PluginSandbox, serviceAccount: object): Promise<void> {
	const mountPath = `${sandbox.root}/fetch`;
	const mountStatus = await sandbox.run({ args: ["-q", mountPath], cmd: "mountpoint" });
	if (mountStatus.exitCode === 0) return;

	await runOrThrow(sandbox, { args: ["-p", mountPath], cmd: "mkdir", sudo: true }, "Fetch mount-directory setup");
	try {
		await sandbox.writeFile({ content: JSON.stringify(serviceAccount), mode: 0o600, path: GCS_KEY_PATH });
		await runOrThrow(
			sandbox,
			{
				args: ["--key-file", GCS_KEY_PATH, "--implicit-dirs", "-o", "ro,allow_other", FETCH_BUCKET, mountPath],
				cmd: "gcsfuse",
				sudo: true,
			},
			"Fetch bucket mount",
		);
	} finally {
		await sandbox.run({ args: ["-f", GCS_KEY_PATH], cmd: "rm", sudo: true });
	}
}

export async function prepareBoltSandbox(sandbox: PluginSandbox, runtimeConfig: RuntimeConfig = config): Promise<void> {
	await configureGit(sandbox, runtimeConfig);
	await prepareRepository(sandbox);
	await mountFetchBucket(sandbox, runtimeConfig.GCS_SERVICE_ACCOUNT_KEY);
}

export async function injectGitHubCredentials(
	context: Pick<BeforeToolExecuteHookContext, "env" | "tool">,
	createToken: () => Promise<string> = createGitHubInstallationToken,
): Promise<void> {
	if (context.tool.name !== "bash") return;
	const token = await createToken();
	context.env.set("GH_TOKEN", token);
	context.env.set("GITHUB_TOKEN", token);
}

const installGcsfuse = [
	"set -eu",
	"printf '%s\\n' '[gcsfuse]' 'name=gcsfuse (packages.cloud.google.com)' 'baseurl=https://packages.cloud.google.com/yum/repos/gcsfuse-el7-x86_64' 'enabled=1' 'gpgcheck=1' 'repo_gpgcheck=0' 'gpgkey=https://packages.cloud.google.com/yum/doc/yum-key.gpg https://packages.cloud.google.com/yum/doc/rpm-package-key.gpg' > /etc/yum.repos.d/gcsfuse.repo",
	`dnf install -y gcsfuse-${GCSFUSE_VERSION}`,
].join("\n");

const warmRepository = [
	"set -eu",
	"mkdir -p /workspace",
	`test -d /workspace/offseason-2026/.git || git clone --depth=1 ${REPOSITORY_URL} /workspace/offseason-2026`,
	"cd /workspace/offseason-2026",
	"./gradlew build --no-daemon --build-cache || true",
	"./gradlew --stop || true",
	"git clean -ffdX",
].join("\n");

export function boltRuntimePlugin() {
	return defineJuniorPlugin({
		hooks: {
			beforeToolExecute: injectGitHubCredentials,
			sandboxPrepare: ({ sandbox }) => prepareBoltSandbox(sandbox),
		},
		manifest: {
			description: "Prepares Bolt's Java, GitHub, robot-code, and read-only Fetch sandbox environment.",
			displayName: "Bolt Runtime",
			name: "bolt-runtime",
			runtimeDependencies: [
				{ package: "git", type: "system" },
				{ package: "gh", type: "system" },
				{ package: "jq", type: "system" },
				{ package: "java-21-amazon-corretto-devel", type: "system" },
				{ package: "fuse", type: "system" },
			],
			runtimePostinstall: [
				{ args: ["-c", installGcsfuse], cmd: "sh", sudo: true },
				{ args: ["-c", warmRepository], cmd: "sh" },
			],
		},
	});
}
