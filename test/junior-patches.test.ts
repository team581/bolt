import { Script } from "node:vm";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { PluginHooks } from "@sentry/junior-plugin-api";
import { describe, expect, it, vi } from "vitest";
import { bundledSection, juniorBundle } from "./junior-bundle.ts";

const runner = juniorBundle("agent-runner-");
const authCode = bundledSection(
	runner.source,
	"function createHookTokenMcpClientProvider(",
	"// src/chat/guardian/policy.ts",
);

function mcpFixture(hook?: PluginHooks["mcpAccessToken"]) {
	const plugin = { manifest: { name: "workspace", mcp: { url: "https://example.com/mcp" } } };
	const abortAgent = vi.fn();
	const oauth = vi.fn().mockResolvedValue({ authSessionId: "actor-oauth" });
	const jwt = vi.fn().mockReturnValue({ jwt: true });
	// Execute the installed, patched runtime with only its external services stubbed.
	const create = new Script(`${authCode}\ncreateMcpAuthOrchestration`).runInNewContext({
		getPlugins: () => [{ ...plugin, hooks: { mcpAccessToken: hook } }],
		createMcpOAuthClientProvider: oauth,
		createJwtBearerMcpClientProvider: jwt,
	}) as (input: object) => {
		authProviderFactory: (plugin: object) => Promise<OAuthClientProvider | undefined>;
		onAuthorizationRequired: (name: string) => Promise<boolean>;
		getPendingPause: () => unknown;
	};
	return {
		plugin,
		abortAgent,
		oauth,
		jwt,
		auth: create({
			abortAgent,
			conversationId: "conversation",
			sessionId: "session",
			actorId: "actor",
			recordPendingAuth: vi.fn(),
			getConfiguration: () => ({}),
		}),
	};
}

describe("Junior's dynamic MCP bearer-token patch", () => {
	it("refreshes tokens for every request and never starts actor OAuth", async () => {
		const hook = vi.fn().mockResolvedValueOnce("token-1").mockResolvedValueOnce("token-2");
		const { auth, plugin, oauth, abortAgent } = mcpFixture(hook);
		const provider = await auth.authProviderFactory(plugin);
		expect(await provider?.tokens()).toEqual({ access_token: "token-1", token_type: "Bearer" });
		expect(await provider?.tokens()).toEqual({ access_token: "token-2", token_type: "Bearer" });
		expect(hook).toHaveBeenNthCalledWith(2, { plugin: { name: "workspace" } });
		await expect(auth.onAuthorizationRequired("workspace")).resolves.toBe(false);
		expect(auth.getPendingPause()).toBeUndefined();
		expect(oauth).not.toHaveBeenCalled();
		expect(abortAgent).not.toHaveBeenCalled();
	});

	it("fails closed on token errors and refuses interactive authentication", async () => {
		const { auth, plugin } = mcpFixture(vi.fn().mockRejectedValue(new Error("mint failed")));
		const provider = await auth.authProviderFactory(plugin);
		await expect(provider?.tokens()).rejects.toThrow("mint failed");
		expect(() => provider?.redirectToAuthorization(new URL("https://example.com/auth"))).toThrow("non-interactive");
		expect(() => provider?.saveCodeVerifier("verifier")).toThrow("non-interactive");
		expect(() => provider?.codeVerifier()).toThrow("non-interactive");
	});

	it("keeps per-actor OAuth and JWT authentication for plugins without the hook", async () => {
		const { auth, plugin, oauth, jwt } = mcpFixture();
		await auth.authProviderFactory(plugin);
		expect(oauth).toHaveBeenCalledWith(expect.objectContaining({ provider: "workspace", userId: "actor" }));
		await auth.authProviderFactory({ manifest: { name: "jwt-plugin", mcp: { url: "https://example.com", auth: {} } } });
		expect(jwt).toHaveBeenCalledWith("jwt-plugin", "https://example.com", {});
	});

	it("does not use another plugin's token hook", async () => {
		const hook = vi.fn();
		const { auth, oauth } = mcpFixture(hook);
		await auth.authProviderFactory({ manifest: { name: "other-plugin" } });
		expect(hook).not.toHaveBeenCalled();
		expect(oauth).toHaveBeenCalledWith(expect.objectContaining({ provider: "other-plugin" }));
	});
});

describe("Junior's Slack and Dashboard access separation", () => {
	it("passes the domain allowlist to Dashboard while leaving Slack workspace access open", () => {
		const { source } = juniorBundle("app.js");
		const wiring = bundledSection(source, "const slackWebhookServices = {", "\n\tconst app = new Hono();");
		const allowedDomains = ["team581.com"];
		const services = new Script(`${wiring}\nslackWebhookServices`).runInNewContext({
			allowedDomains,
			options: {},
			conversationWorkQueue: {},
			runtimeServiceOverrides: {},
			createProductionSlackWebhookServices: () => ({}),
		}) as { allowedDomains: string[]; autoJoinNewChannels: boolean };
		expect(services.allowedDomains).toEqual([]);
		expect(services.autoJoinNewChannels).toBe(false);
		expect(allowedDomains).toEqual(["team581.com"]);
		// Dashboard and the newly added remote MCP server must retain the original allowlist.
		expect(source).toContain("resolveSignInAuthConfig(botConfig.userName, allowedDomains, dashboard)");
		expect(source).toMatch(/createDashboardRouteRegistrations\(\{\s*allowedDomains,/u);
		expect(source).toMatch(/createMcpHttpHandler\(\{\s*allowedDomains,/u);
	});
});
