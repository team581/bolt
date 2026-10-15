import { request } from "@octokit/request";
import { defineJuniorPlugin, definePluginTool } from "@sentry/junior-plugin-api";
import { z } from "zod";
import { createGitHubMembershipToken } from "../../src/github-app.ts";

const membershipState = z.enum(["active", "pending"]);
const inputSchema = z.strictObject({
	username: z.string(),
});

function checkMembershipRoute(username: string): void {
	// URL normalization must not turn a membership operation into a team operation.
	if (username === "." || username === "..") throw new Error("Username must not change the GitHub API route");
}

export function createAddStudentTool() {
	return definePluginTool({
		description: "Add a GitHub user to Team 581's Students team.",
		approvalMode: "review",
		annotations: {
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
			readOnlyHint: false,
		},
		inputSchema,
		outputSchema: z.object({ username: z.string(), state: membershipState }),
		async execute({ username }, { signal }) {
			checkMembershipRoute(username);
			const token = await createGitHubMembershipToken();
			const parameters = {
				org: "team581",
				team_slug: "students",
				username,
				headers: { authorization: `Bearer ${token}` },
				request: { signal },
			};

			// Avoid demoting an existing team maintainer when asked to add them.
			try {
				const { data } = await request("GET /orgs/{org}/teams/{team_slug}/memberships/{username}", parameters);
				return { username, state: membershipState.parse(data.state) };
			} catch (error) {
				if (!(error instanceof Error && "status" in error && error.status === 404)) throw error;
			}

			const { data } = await request("PUT /orgs/{org}/teams/{team_slug}/memberships/{username}", {
				...parameters,
				role: "member",
			});
			return { username, state: membershipState.parse(data.state) };
		},
	});
}

export function createRemoveStudentTool() {
	return definePluginTool({
		description: "Remove a GitHub user from Team 581's Students team.",
		approvalMode: "review",
		annotations: {
			destructiveHint: true,
			idempotentHint: true,
			openWorldHint: true,
			readOnlyHint: false,
		},
		inputSchema,
		outputSchema: z.object({ username: z.string(), state: z.literal("removed") }),
		async execute({ username }, { signal }) {
			checkMembershipRoute(username);
			const token = await createGitHubMembershipToken();
			await request("DELETE /orgs/{org}/teams/{team_slug}/memberships/{username}", {
				org: "team581",
				team_slug: "students",
				username,
				headers: { authorization: `Bearer ${token}` },
				request: { signal },
			});
			return { username, state: "removed" as const };
		},
	});
}

export function githubMembershipPlugin() {
	return defineJuniorPlugin({
		manifest: {
			name: "github-membership",
			displayName: "GitHub Student Membership",
			description: "Manages membership of Team 581's Students team.",
		},
		hooks: {
			tools: () => ({
				add_student: createAddStudentTool(),
				remove_student: createRemoveStudentTool(),
			}),
		},
	});
}
