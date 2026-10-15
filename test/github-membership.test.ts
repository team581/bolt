import { beforeEach, describe, expect, it, vi } from "vitest";

const { request, createToken } = vi.hoisted(() => ({ request: vi.fn(), createToken: vi.fn() }));
vi.mock("@octokit/request", () => ({ request }));
vi.mock("../src/github-app.ts", () => ({ createGitHubMembershipToken: createToken }));

const { createAddStudentTool, createRemoveStudentTool } = await import("../app/plugins/github-membership.ts");
const addTool = createAddStudentTool();
const removeTool = createRemoveStudentTool();
type MembershipTool = typeof addTool | typeof removeTool;

async function execute(tool: MembershipTool, input: unknown) {
	if (!tool.execute || !tool.prepareArguments) throw new Error("Membership tool is not executable");
	const result = await tool.execute(tool.prepareArguments(input), {});
	return result;
}

beforeEach(() => {
	request.mockReset();
	createToken.mockReset().mockResolvedValue("membership-token");
});

describe("student membership tool", () => {
	describe.each([
		["add", addTool],
		["remove", removeTool],
	] as const)("%s input validation", (_name, tool) => {
		it.each([
			{ username: "student", team: "coaches" },
			{ username: "student", org: "another-org" },
			{ username: "student", role: "maintainer" },
			{ username: "student", action: "remove_from_organization" },
		])("rejects unsupported targets and inputs: %j", async (input) => {
			await expect(execute(tool, input)).rejects.toThrow("Invalid tool arguments");
			expect(createToken).not.toHaveBeenCalled();
			expect(request).not.toHaveBeenCalled();
		});

		it.each([".", ".."])("prevents %s from changing the API route", async (username) => {
			await expect(execute(tool, { username })).rejects.toThrow("must not change the GitHub API route");
			expect(createToken).not.toHaveBeenCalled();
			expect(request).not.toHaveBeenCalled();
		});

		it("defers username validation to GitHub", async () => {
			request.mockRejectedValueOnce(Object.assign(new Error("Validation Failed"), { status: 422 }));

			await expect(execute(tool, { username: "invalid_username" })).rejects.toThrow("Validation Failed");
			expect(request).toHaveBeenCalledExactlyOnceWith(
				expect.any(String),
				expect.objectContaining({ org: "team581", team_slug: "students", username: "invalid_username" }),
			);
		});
	});

	it("invites a non-member only into Students with the member role", async () => {
		request.mockRejectedValueOnce(Object.assign(new Error("Not Found"), { status: 404 }));
		request.mockResolvedValueOnce({ data: { state: "pending", role: "member" } });

		await expect(execute(addTool, { username: "new-student" })).resolves.toEqual({
			username: "new-student",
			state: "pending",
		});
		expect(request).toHaveBeenLastCalledWith("PUT /orgs/{org}/teams/{team_slug}/memberships/{username}", {
			org: "team581",
			team_slug: "students",
			username: "new-student",
			role: "member",
			headers: { authorization: "Bearer membership-token" },
			request: { signal: undefined },
		});
		expect(request).toHaveBeenCalledTimes(2);
	});

	it("preserves an existing team maintainer's role", async () => {
		request.mockResolvedValueOnce({ data: { state: "active", role: "maintainer" } });

		await expect(execute(addTool, { username: "existing-student" })).resolves.toEqual({
			username: "existing-student",
			state: "active",
		});
		expect(request).toHaveBeenCalledExactlyOnceWith(
			"GET /orgs/{org}/teams/{team_slug}/memberships/{username}",
			expect.objectContaining({ org: "team581", team_slug: "students", username: "existing-student" }),
		);
	});

	it("stops on a permission failure instead of attempting a write", async () => {
		request.mockRejectedValueOnce(Object.assign(new Error("Forbidden"), { status: 403 }));

		await expect(execute(addTool, { username: "student" })).rejects.toThrow("Forbidden");
		expect(request).toHaveBeenCalledOnce();
	});

	it("removes only the Students team membership", async () => {
		request.mockResolvedValueOnce({ status: 204 });

		await expect(execute(removeTool, { username: "student" })).resolves.toEqual({
			username: "student",
			state: "removed",
		});
		expect(request).toHaveBeenCalledExactlyOnceWith(
			"DELETE /orgs/{org}/teams/{team_slug}/memberships/{username}",
			expect.objectContaining({ org: "team581", team_slug: "students", username: "student" }),
		);
	});

	it("reports a failed removal without retrying or claiming success", async () => {
		request.mockRejectedValueOnce(new Error("GitHub unavailable"));

		await expect(execute(removeTool, { username: "student" })).rejects.toThrow("GitHub unavailable");
		expect(request).toHaveBeenCalledOnce();
	});
});
