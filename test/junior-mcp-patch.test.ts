import { readFileSync, readdirSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

type Provider = {
	tokens(): Promise<{ access_token: string; token_type: string }>;
	redirectToAuthorization(): void;
	codeVerifier(): void;
};
type Plugin = { manifest: { name: string; mcp: { url: string; auth?: object } } };
type Orchestration = {
	authProviderFactory(plugin: Plugin): Promise<Provider | undefined>;
	onAuthorizationRequired(provider: string): Promise<boolean>;
	getPendingPause(): unknown;
};

// Exercise the installed bundle: a missing or stale runtime patch can pass type checking.
const dist = new URL("./", import.meta.resolve("@sentry/junior"));
const runner = readdirSync(dist).find((name) => /^agent-runner-.*\.js$/.test(name));
if (!runner) throw new Error("Junior's agent runner bundle was not found");
const bundle = readFileSync(new URL(runner, dist), "utf8");
const start = bundle.indexOf("function createHookTokenMcpClientProvider(");
if (start < 0) throw new Error("Junior's MCP bearer-token patch is missing");
const source = bundle.slice(start, bundle.indexOf("\n//#endregion", start));

function setup(hook?: (ctx: { plugin: { name: string } }) => Promise<string>) {
	const jwt = vi.fn(() => ({ jwt: true }));
	const create = runInNewContext(`${source}\ncreateMcpAuthOrchestration`, {
		pluginFor: () => ({ hooks: { mcpAccessToken: hook } }),
		createJwtBearerMcpClientProvider: jwt,
	}) as (input: object) => Orchestration;
	return { orchestration: create({}), jwt };
}

const plugin: Plugin = { manifest: { name: "google-drive", mcp: { url: "https://example.com/mcp" } } };

describe("installed Junior MCP bearer-token patch", () => {
	it("uses the service-account hook without actor OAuth and refreshes tokens on each request", async () => {
		const hook = vi.fn().mockResolvedValueOnce("first-token").mockResolvedValueOnce("refreshed-token");
		const { orchestration, jwt } = setup(hook);
		const provider = await orchestration.authProviderFactory(plugin);
		expect(provider).toBeDefined();
		await expect(provider!.tokens()).resolves.toEqual({ access_token: "first-token", token_type: "Bearer" });
		await expect(provider!.tokens()).resolves.toEqual({ access_token: "refreshed-token", token_type: "Bearer" });
		expect(hook).toHaveBeenCalledWith({ plugin: { name: "google-drive" } });
		expect(jwt).not.toHaveBeenCalled();
		expect(() => provider!.redirectToAuthorization()).toThrow("non-interactive");
		expect(() => provider!.codeVerifier()).toThrow("non-interactive");
		await expect(orchestration.onAuthorizationRequired("google-drive")).resolves.toBe(false);
		expect(orchestration.getPendingPause()).toBeUndefined();
	});

	it("propagates token failures instead of pausing for user authorization", async () => {
		const { orchestration } = setup(vi.fn().mockRejectedValue(new Error("token unavailable")));
		const provider = await orchestration.authProviderFactory(plugin);
		await expect(provider!.tokens()).rejects.toThrow("token unavailable");
		await expect(orchestration.onAuthorizationRequired("google-drive")).resolves.toBe(false);
	});

	it("preserves JWT authentication and the missing-actor fallback for unhooked plugins", async () => {
		const { orchestration, jwt } = setup();
		await expect(orchestration.authProviderFactory(plugin)).resolves.toBeUndefined();
		await orchestration.authProviderFactory({
			manifest: { ...plugin.manifest, mcp: { ...plugin.manifest.mcp, auth: {} } },
		});
		expect(jwt).toHaveBeenCalledWith("google-drive", "https://example.com/mcp", {});
	});
});
