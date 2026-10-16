import type { PluginToolDefinition } from "@sentry/junior-plugin-api";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { api, createClient, getAccessToken, config, serviceAccount } = vi.hoisted(() => {
	const key = { client_email: "bolt@example.iam.gserviceaccount.com", private_key: "test-private-key" };
	return {
		api: {
			groups: {
				lookup: vi.fn(),
				memberships: { lookup: vi.fn(), get: vi.fn(), list: vi.fn(), create: vi.fn(), delete: vi.fn() },
			},
		},
		createClient: vi.fn(),
		getAccessToken: vi.fn(),
		config: { GOOGLE_SERVICE_ACCOUNT_KEY: key },
		serviceAccount: key,
	};
});
vi.mock("../src/config.ts", () => ({ config }));
vi.mock("@googleapis/cloudidentity", () => ({ cloudidentity: () => api }));
vi.mock("google-auth-library", () => ({
	JWT: class {
		constructor(options: unknown) {
			createClient(options);
		}
		getAccessToken = getAccessToken;
	},
}));

const { createAddStudentTool, createRemoveStudentTool, createListStudentsTool } =
	await import("../app/plugins/google-groups.ts");
const addTool = createAddStudentTool();
const removeTool = createRemoveStudentTool();
const listTool = createListStudentsTool();
const group = "groups/students-id";
const email = "student@gmail.com";
const membership = {
	name: `${group}/memberships/student-id`,
	preferredMemberKey: { id: email },
	roles: [{ name: "MEMBER" }],
	type: "USER",
};
const memberships = api.groups.memberships;

async function execute(tool: PluginToolDefinition, input: unknown, signal?: AbortSignal) {
	if (!tool.execute || !tool.prepareArguments) throw new Error("Group tool is not executable");
	return await tool.execute(tool.prepareArguments(input), { signal });
}

function apiError(status: number) {
	return Object.assign(new Error(`Google API error ${status}`), { response: { status } });
}

function existingMember(member = membership) {
	memberships.lookup.mockResolvedValueOnce({ data: { name: membership.name } });
	memberships.get.mockResolvedValueOnce({ data: member });
}

function expectNoWrites() {
	expect(memberships.create).not.toHaveBeenCalled();
	expect(memberships.delete).not.toHaveBeenCalled();
}

beforeEach(() => {
	api.groups.lookup.mockReset().mockResolvedValue({ data: { name: group } });
	memberships.lookup.mockReset().mockRejectedValue(apiError(404));
	memberships.get.mockReset();
	memberships.list.mockReset().mockResolvedValue({ data: { memberships: [] } });
	memberships.create.mockReset().mockResolvedValue({ data: { done: true } });
	memberships.delete.mockReset().mockResolvedValue({ data: { done: true } });
});

describe("Google student group tools", () => {
	describe.each([
		["add", addTool],
		["remove", removeTool],
	] as const)("%s validation", (_name, tool) => {
		it.each([
			{ email, group: "coaches@team581.com" },
			{ email, role: "OWNER" },
			{ email, subject: "admin@team581.com" },
			{ email: "../coaches@team581.com/members" },
			{ email: "not an email" },
		])("rejects invalid or privileged inputs: %j", async (input) => {
			await expect(execute(tool, input)).rejects.toThrow("Invalid tool arguments");
			expect(api.groups.lookup).not.toHaveBeenCalled();
			expectNoWrites();
		});
	});

	it("adds an external Google account only as a MEMBER of the fixed student group", async () => {
		const signal = new AbortController().signal;
		await expect(execute(addTool, { email }, signal)).resolves.toEqual({ email, state: "added" });
		expect(createClient).toHaveBeenCalledWith({
			email: serviceAccount.client_email,
			key: serviceAccount.private_key,
			scopes: ["https://www.googleapis.com/auth/cloud-identity.groups"],
		});
		expect(api.groups.lookup).toHaveBeenCalledExactlyOnceWith({ "groupKey.id": "students@team581.com" }, { signal });
		expect(memberships.lookup).toHaveBeenCalledExactlyOnceWith({ parent: group, "memberKey.id": email }, { signal });
		expect(memberships.create).toHaveBeenCalledExactlyOnceWith(
			{ parent: group, requestBody: { preferredMemberKey: { id: email }, roles: [{ name: "MEMBER" }] } },
			{ signal },
		);
	});

	it("leaves existing owners' roles unchanged when asked to add them", async () => {
		existingMember({ ...membership, roles: [{ name: "MEMBER" }, { name: "OWNER" }] });
		await expect(execute(addTool, { email })).resolves.toEqual({ email, state: "already_member" });
		expectNoWrites();
	});

	it("removes the resolved regular user membership", async () => {
		existingMember();
		const signal = new AbortController().signal;
		await expect(execute(removeTool, { email }, signal)).resolves.toEqual({ email, state: "removed" });
		expect(memberships.get).toHaveBeenCalledExactlyOnceWith({ name: membership.name }, { signal });
		expect(memberships.delete).toHaveBeenCalledExactlyOnceWith({ name: membership.name }, { signal });
	});

	it.each([
		{ ...membership, roles: [{ name: "MEMBER" }, { name: "OWNER" }] },
		{ ...membership, roles: [{ name: "MANAGER" }] },
		{ ...membership, type: "SERVICE_ACCOUNT" },
		{ ...membership, type: "GROUP" },
		{ ...membership, roles: [] },
	])("protects privileged or non-user memberships from removal: %j", async (member) => {
		existingMember(member);
		await expect(execute(removeTool, { email })).rejects.toThrow("Only regular user memberships can be removed");
		expectNoWrites();
	});

	it("reports an absent membership without issuing a deletion", async () => {
		await expect(execute(removeTool, { email })).resolves.toEqual({ email, state: "not_member" });
		expectNoWrites();
	});

	it.each([403, 429, 500])("stops on lookup error %s rather than attempting a write", async (status) => {
		memberships.lookup.mockRejectedValueOnce(apiError(status));
		await expect(execute(addTool, { email })).rejects.toThrow(`Google API error ${status}`);
		expectNoWrites();
	});

	it("does not treat a missing group as an absent student", async () => {
		api.groups.lookup.mockRejectedValueOnce(apiError(404));
		await expect(execute(removeTool, { email })).rejects.toThrow("Google API error 404");
		expect(memberships.lookup).not.toHaveBeenCalled();
		expectNoWrites();
	});

	it("rejects a membership lookup pointing at a different group", async () => {
		memberships.lookup.mockResolvedValueOnce({ data: { name: "groups/coaches-id/memberships/student-id" } });
		await expect(execute(removeTool, { email })).rejects.toThrow("membership in a different group");
		expect(memberships.get).not.toHaveBeenCalled();
		expectNoWrites();
	});

	it.each([addTool, removeTool])("reports pending operations without claiming completion", async (tool) => {
		if (tool === removeTool) existingMember();
		const method = tool === addTool ? memberships.create : memberships.delete;
		method.mockResolvedValueOnce({ data: { name: "operations/pending" } });
		await expect(execute(tool, { email })).resolves.toEqual({ email, state: "pending" });
	});

	it.each([addTool, removeTool])("surfaces errors inside successful HTTP responses", async (tool) => {
		if (tool === removeTool) existingMember();
		const method = tool === addTool ? memberships.create : memberships.delete;
		method.mockResolvedValueOnce({ data: { done: true, error: { code: 7, message: "Permission denied" } } });
		await expect(execute(tool, { email })).rejects.toThrow(
			"Google group membership operation failed: Permission denied",
		);
	});

	it("collects every membership page", async () => {
		const owner = { ...membership, name: `${group}/memberships/owner-id`, roles: [{ name: "OWNER" }] };
		memberships.list
			.mockResolvedValueOnce({ data: { memberships: [membership], nextPageToken: "next-page" } })
			.mockResolvedValueOnce({ data: { memberships: [owner] } });
		await expect(execute(listTool, {})).resolves.toEqual({
			group: "students@team581.com",
			memberships: [membership, owner],
		});
		expect(memberships.list).toHaveBeenLastCalledWith(
			{ parent: group, view: "FULL", pageSize: 500, pageToken: "next-page" },
			{ signal: undefined },
		);
	});

	it("rejects failed later pages instead of returning a partial membership list", async () => {
		memberships.list
			.mockResolvedValueOnce({ data: { memberships: [membership], nextPageToken: "next-page" } })
			.mockRejectedValueOnce(apiError(500));
		await expect(execute(listTool, {})).rejects.toThrow("Google API error 500");
	});

	it("keeps hosted Workspace tokens read-only when sharing the group service account", async () => {
		const { googleWorkspacePlugins } = await import("../app/plugins/google-workspace.ts");
		getAccessToken.mockResolvedValue({ token: "read-only-token" });
		for (const plugin of googleWorkspacePlugins()) {
			if (!plugin.hooks?.mcpAccessToken) throw new Error("Missing Workspace access token hook");
			await expect(plugin.hooks.mcpAccessToken({ plugin: { name: plugin.manifest.name } })).resolves.toBe(
				"read-only-token",
			);
		}
		expect(createClient).toHaveBeenCalledExactlyOnceWith({
			email: serviceAccount.client_email,
			key: serviceAccount.private_key,
			scopes: [
				"https://www.googleapis.com/auth/drive.readonly",
				"https://www.googleapis.com/auth/documents.readonly",
				"https://www.googleapis.com/auth/spreadsheets.readonly",
				"https://www.googleapis.com/auth/presentations.readonly",
			],
		});
	});
});
