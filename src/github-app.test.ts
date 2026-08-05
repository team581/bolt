import { createAppAuth } from "@octokit/auth-app";
import { request } from "@octokit/request";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createGitHubInstallationToken, revokeGitHubInstallationToken } from "./github-app.ts";

const { authMock, requestMock } = vi.hoisted(() => ({
	authMock: vi.fn(),
	requestMock: vi.fn(),
}));

vi.mock("@octokit/auth-app", () => ({ createAppAuth: vi.fn(() => authMock) }));
vi.mock("@octokit/request", () => ({ request: { defaults: vi.fn(() => requestMock) } }));

beforeEach(() => {
	authMock.mockReset();
	requestMock.mockReset();
});

describe("GitHub App authentication", () => {
	it("configures authentication for the app installation", () => {
		expect(createAppAuth).toHaveBeenCalledWith({
			appId: "test-github-app-id",
			installationId: 12_345,
			privateKey: "test-github-private-key",
			request: requestMock,
		});
		expect(request.defaults).toHaveBeenCalledWith({
			headers: {
				"user-agent": "team581-bolt",
				"x-github-api-version": "2026-03-10",
			},
		});
	});

	it("creates a fresh, permission-scoped token for each sandbox", async () => {
		authMock.mockResolvedValue({ token: "ghs_test" });

		await expect(createGitHubInstallationToken()).resolves.toBe("ghs_test");
		expect(authMock).toHaveBeenCalledWith({
			type: "installation",
			permissions: {
				actions: "write",
				contents: "write",
				issues: "write",
				metadata: "read",
				organization_projects: "write",
				pull_requests: "write",
				repository_projects: "write",
				workflows: "write",
			},
			refresh: true,
		});
	});

	it("revokes an installation token", async () => {
		requestMock.mockResolvedValue({ status: 204 });

		await revokeGitHubInstallationToken("ghs_test");
		expect(requestMock).toHaveBeenCalledWith("DELETE /installation/token", {
			headers: { authorization: "Bearer ghs_test" },
		});
	});
});
