import { useAgentFinish, useSandbox } from "@flue/runtime";
import { ModalClient } from "modal";
import { createGitHubInstallationToken, revokeGitHubInstallationToken } from "../../github-app.ts";
import { config } from "../../config.ts";
import { modal } from "../../sandboxes/modal.ts";

export function useBoltSandbox(): void {
	useSandbox({
		async createSessionEnv(options) {
			const client = new ModalClient({
				tokenId: config.MODAL_TOKEN_ID,
				tokenSecret: config.MODAL_TOKEN_SECRET,
			});
			const app = await client.apps.fromName(config.MODAL_APP_NAME, { createIfMissing: true });
			const image = client.images.fromRegistry(config.BOLT_SANDBOX_IMAGE);
			const githubToken = await createGitHubInstallationToken();
			try {
				const sandbox = await client.sandboxes.create(app, image, { env: { GH_TOKEN: githubToken } });
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
				return session;
			} catch (error) {
				await revokeGitHubInstallationToken(githubToken).catch(() => undefined);
				throw error;
			}
		},
	});

	useAgentFinish(async ({ harness }) => {
		await harness.sandbox
			.exec("gh api --method DELETE /installation/token", { timeoutMs: 10_000 })
			.catch(() => undefined);
	});
}
