import { useAgentFinish, useSandbox } from "@flue/runtime";
import { createHash } from "node:crypto";
import { ModalClient, type Sandbox as ModalSandbox } from "modal";
import { createGitHubInstallationToken, revokeGitHubInstallationToken } from "../../github-app.ts";
import { config } from "../../config.ts";
import { modal } from "../../sandboxes/modal.ts";
import { reportError } from "../../sentry.ts";

const SANDBOX_TIMEOUT_MS = 30 * 60_000;
const SANDBOX_IDLE_TIMEOUT_MS = 5 * 60_000;
const activeSandboxes = new Map<string, ModalSandbox>();

export function useBoltSandbox(instanceId: string): void {
	useSandbox({
		async createSessionEnv(options) {
			const client = new ModalClient({
				tokenId: config.MODAL_TOKEN_ID,
				tokenSecret: config.MODAL_TOKEN_SECRET,
			});
			const app = await client.apps.fromName(config.MODAL_APP_NAME, { createIfMissing: true });
			const image = client.images.fromRegistry(config.BOLT_SANDBOX_IMAGE);
			const workspaceKey = createHash("sha256").update(options.id).digest("hex");
			const workspaceVolume = await client.volumes.fromName(`${config.MODAL_APP_NAME}-workspaces`, {
				createIfMissing: true,
			});
			const githubToken = await createGitHubInstallationToken();
			try {
				const sandbox = await client.sandboxes.create(app, image, {
					env: { GH_TOKEN: githubToken },
					idleTimeoutMs: SANDBOX_IDLE_TIMEOUT_MS,
					tags: { "bolt-instance": workspaceKey },
					timeoutMs: SANDBOX_TIMEOUT_MS,
					volumes: {
						"/workspace": workspaceVolume.withMountOptions({ subPath: `conversations/${workspaceKey}` }),
					},
				});
				const session = await modal(sandbox, { cwd: "/workspace" }).createSessionEnv(options);
				try {
					const setup = await session.exec(
						`set -e
git config --global user.name "$GITHUB_APP_BOT_NAME"
git config --global user.email "$GITHUB_APP_BOT_EMAIL"
gh auth setup-git --hostname github.com --force
gh auth status --active`,
						{
							env: {
								GITHUB_APP_BOT_EMAIL: config.GITHUB_APP_BOT_EMAIL,
								GITHUB_APP_BOT_NAME: config.GITHUB_APP_BOT_NAME,
							},
							timeoutMs: 10_000,
						},
					);
					if (setup.exitCode !== 0) throw new Error("GitHub sandbox setup failed.");
				} catch (error) {
					await sandbox.terminate().catch(() => undefined);
					throw error;
				}
				activeSandboxes.set(options.id, sandbox);
				return session;
			} catch (error) {
				await revokeGitHubInstallationToken(githubToken).catch(() => undefined);
				throw error;
			}
		},
	});

	useAgentFinish(async ({ harness }) => {
		try {
			await harness.sandbox.exec("sync /workspace", { timeoutMs: 10_000 }).catch(() => undefined);
			await harness.sandbox
				.exec("gh api --method DELETE /installation/token", { timeoutMs: 10_000 })
				.catch(() => undefined);
		} finally {
			const sandbox = activeSandboxes.get(instanceId);
			activeSandboxes.delete(instanceId);
			if (sandbox) {
				await sandbox.terminate({ wait: true }).catch((error: unknown) => {
					reportError(error, "Failed to terminate Modal sandbox", { instanceId });
				});
			}
		}
	});
}
