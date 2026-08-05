import { createAppAuth } from "@octokit/auth-app";
import { request } from "@octokit/request";
import { config } from "./config.ts";

const INSTALLATION_TOKEN_PERMISSIONS = {
	actions: "write",
	contents: "write",
	issues: "write",
	metadata: "read",
	organization_projects: "write",
	pull_requests: "write",
	repository_projects: "write",
	workflows: "write",
} as const;

const githubRequest = request.defaults({
	headers: {
		"user-agent": "team581-bolt",
		"x-github-api-version": "2026-03-10",
	},
});

const auth = createAppAuth({
	appId: config.GITHUB_APP_ID,
	installationId: config.GITHUB_INSTALLATION_ID,
	privateKey: config.GITHUB_APP_PRIVATE_KEY,
	request: githubRequest,
});

export async function createGitHubInstallationToken(): Promise<string> {
	const authentication = await auth({
		type: "installation",
		permissions: INSTALLATION_TOKEN_PERMISSIONS,
		// Each sandbox must have its own token so revoking one does not affect another.
		refresh: true,
	});
	return authentication.token;
}

export async function revokeGitHubInstallationToken(token: string): Promise<void> {
	await githubRequest("DELETE /installation/token", {
		headers: { authorization: `Bearer ${token}` },
	});
}
