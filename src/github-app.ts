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
		// Explicit permissions keep membership writes out of the sandbox token.
		permissions: {
			actions: "write",
			contents: "write",
			issue_fields: "read",
			issue_types: "read",
			issues: "write",
			members: "read",
			metadata: "read",
			organization_projects: "write",
			pull_requests: "write",
			repository_projects: "write",
			workflows: "write",
		},
	});
	return authentication.token;
}

export async function createGitHubMembershipToken(): Promise<string> {
	const authentication = await auth({
		type: "installation",
		permissions: { members: "write" },
		refresh: true,
	});
	return authentication.token;
}
