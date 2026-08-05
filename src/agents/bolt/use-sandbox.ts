import { useAgentFinish, useSandbox } from "@flue/runtime";
import { createHash } from "node:crypto";
import { AlreadyExistsError, ModalClient, NotFoundError, type Sandbox as ModalSandbox } from "modal";
import { createGitHubInstallationToken, revokeGitHubInstallationToken } from "../../github-app.ts";
import { config } from "../../config.ts";
import { modal } from "../../sandboxes/modal.ts";
import { reportError } from "../../sentry.ts";

const SANDBOX_TIMEOUT_MS = 30 * 60_000;
const SANDBOX_IDLE_TIMEOUT_MS = 5 * 60_000;
const SANDBOX_SETUP_TIMEOUT_MS = 5 * 60_000;
const REPOSITORY_PULL_TIMEOUT_MS = 60_000;
const SANDBOX_CLEANUP_TIMEOUT_MS = 10_000;

function createModalClient(): ModalClient {
	return new ModalClient({
		tokenId: config.MODAL_TOKEN_ID,
		tokenSecret: config.MODAL_TOKEN_SECRET,
	});
}

function sandboxIdentity(instanceId: string): { name: string; workspaceKey: string } {
	// Agent IDs can contain characters Modal names reject, such as the colons in Slack thread IDs.
	const workspaceKey = createHash("sha256").update(instanceId).digest("base64url");
	return { name: `bolt-${workspaceKey}`, workspaceKey };
}

async function findSandbox(client: ModalClient, name: string): Promise<ModalSandbox | undefined> {
	try {
		return await client.sandboxes.fromName(config.MODAL_APP_NAME, name);
	} catch (error) {
		if (error instanceof NotFoundError) return undefined;
		throw error;
	}
}

async function runCleanupCommand(sandbox: ModalSandbox, command: string[]): Promise<void> {
	const process = await sandbox.exec(command, {
		stderr: "ignore",
		stdout: "ignore",
		timeoutMs: SANDBOX_CLEANUP_TIMEOUT_MS,
	});
	const exitCode = await process.wait();
	if (exitCode !== 0) throw new Error(`Sandbox cleanup command exited with code ${exitCode}.`);
}

async function revokeSandboxGitHubToken(sandbox: ModalSandbox): Promise<void> {
	await runCleanupCommand(sandbox, ["gh", "api", "--method", "DELETE", "/installation/token"]);
}

async function acquireSandbox(instanceId: string): Promise<ModalSandbox> {
	const client = createModalClient();
	const { name, workspaceKey } = sandboxIdentity(instanceId);
	const existingSandbox = await findSandbox(client, name);
	if (existingSandbox) return existingSandbox;

	const app = await client.apps.fromName(config.MODAL_APP_NAME, { createIfMissing: true });
	const image = client.images.fromRegistry(config.BOLT_SANDBOX_IMAGE);
	const workspaceVolume = await client.volumes.fromName(`${config.MODAL_APP_NAME}-workspaces`, {
		createIfMissing: true,
	});
	const githubToken = await createGitHubInstallationToken();
	try {
		return await client.sandboxes.create(app, image, {
			cpu: 1,
			cpuLimit: 2,
			env: {
				GH_TOKEN: githubToken,
				GRADLE_RO_DEP_CACHE: "/opt/bolt/gradle-dependencies",
				GRADLE_USER_HOME: "/workspace/.gradle",
			},
			idleTimeoutMs: SANDBOX_IDLE_TIMEOUT_MS,
			memoryLimitMiB: 4_096,
			memoryMiB: 2_048,
			name,
			tags: { "bolt-instance": workspaceKey },
			timeoutMs: SANDBOX_TIMEOUT_MS,
			volumes: {
				"/workspace": workspaceVolume.withMountOptions({ subPath: `conversations/${workspaceKey}` }),
			},
			workdir: "/workspace",
		});
	} catch (error) {
		await revokeGitHubInstallationToken(githubToken).catch(() => undefined);
		if (error instanceof AlreadyExistsError) {
			return client.sandboxes.fromName(config.MODAL_APP_NAME, name);
		}
		throw error;
	}
}

export function useBoltSandbox(instanceId: string): void {
	useSandbox({
		async createSessionEnv(options) {
			const sandbox = await acquireSandbox(options.id);
			const session = await modal(sandbox, { cwd: "/workspace" }).createSessionEnv(options);
			try {
				const setup = await session.exec(
					`set -e
git config --global user.name "$GITHUB_APP_BOT_NAME"
git config --global user.email "$GITHUB_APP_BOT_EMAIL"
gh auth setup-git --hostname github.com --force
gh auth status --active
java -version
if [ ! -e /workspace/offseason-2026 ]; then
	cp -a /opt/bolt/repositories/offseason-2026 /workspace/offseason-2026
fi
if [ ! -e /workspace/.gradle ]; then
	cp -a /opt/bolt/gradle-home /workspace/.gradle
fi`,
					{
						env: {
							GITHUB_APP_BOT_EMAIL: config.GITHUB_APP_BOT_EMAIL,
							GITHUB_APP_BOT_NAME: config.GITHUB_APP_BOT_NAME,
						},
						timeoutMs: SANDBOX_SETUP_TIMEOUT_MS,
					},
				);
				if (setup.exitCode !== 0) throw new Error("Sandbox setup failed.");
				await session
					.exec("git -C /workspace/offseason-2026 pull --ff-only --quiet", {
						timeoutMs: REPOSITORY_PULL_TIMEOUT_MS,
					})
					.catch(() => undefined);
			} catch (error) {
				await revokeSandboxGitHubToken(sandbox).catch(() => undefined);
				await sandbox.terminate({ wait: true }).catch(() => undefined);
				throw error;
			}
			return session;
		},
	});

	useAgentFinish(async () => {
		const client = createModalClient();
		const { name } = sandboxIdentity(instanceId);
		let sandbox: ModalSandbox | undefined;
		try {
			sandbox = await findSandbox(client, name);
		} catch (error) {
			reportError(error, "Failed to find Modal sandbox during cleanup", { instanceId });
			return;
		}
		if (!sandbox) return;

		await runCleanupCommand(sandbox, ["sync", "/workspace"]).catch((error: unknown) => {
			reportError(error, "Failed to sync Modal sandbox workspace", { instanceId });
		});
		await revokeSandboxGitHubToken(sandbox).catch((error: unknown) => {
			reportError(error, "Failed to revoke sandbox GitHub token", { instanceId });
		});
		await sandbox.terminate({ wait: true }).catch((error: unknown) => {
			reportError(error, "Failed to terminate Modal sandbox", { instanceId });
		});
	});
}
