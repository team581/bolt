import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth } = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@octokit/auth-app", () => ({ createAppAuth: () => auth }));

const { createGitHubInstallationToken, createGitHubMembershipToken } = await import("../src/github-app.ts");

beforeEach(() => auth.mockReset());

describe("GitHub token permissions", () => {
	it("restricts sandbox membership access while retaining code and project writes", async () => {
		auth.mockResolvedValue({ token: "sandbox-token", permissions: { members: "read" } });

		expect(await createGitHubInstallationToken()).toBe("sandbox-token");
		expect(auth).toHaveBeenCalledExactlyOnceWith({
			type: "installation",
			refresh: true,
			permissions: {
				actions: "write",
				members: "read",
				contents: "write",
				issues: "write",
				pull_requests: "write",
				organization_projects: "write",
				issue_fields: "read",
				issue_types: "read",
				metadata: "read",
				repository_projects: "write",
				workflows: "write",
			},
		});
	});

	it("requests only membership permissions for the server-side tool", async () => {
		auth.mockResolvedValue({ token: "membership-token", permissions: { members: "write" } });

		expect(await createGitHubMembershipToken()).toBe("membership-token");
		expect(auth).toHaveBeenCalledExactlyOnceWith({
			type: "installation",
			refresh: true,
			permissions: { members: "write" },
		});
	});
});
