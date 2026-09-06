import { createAppAuth } from "@octokit/auth-app";
import { config } from "./config.ts";

const auth = createAppAuth({
	appId: config.GITHUB_APP_ID,
	installationId: config.GITHUB_INSTALLATION_ID,
	privateKey: config.GITHUB_APP_PRIVATE_KEY,
});

export async function createGitHubInstallationToken(): Promise<string> {
	const authentication = await auth({
		type: "installation",
		refresh: true,
	});
	return authentication.token;
}
