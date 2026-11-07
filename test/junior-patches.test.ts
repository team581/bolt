import { createServer } from "node:http";
import { Script } from "node:vm";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
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
	it("authenticates real MCP HTTP requests with a freshly minted bearer token", async () => {
		let tokenNumber = 0;
		const { auth, plugin } = mcpFixture(() => `fixture-${++tokenNumber}`);
		const provider = await auth.authProviderFactory(plugin);
		const receivedTokens: Array<string | undefined> = [];
		const server = createServer((request, response) => {
			if (request.method !== "POST") {
				response.writeHead(405).end();
				return;
			}
			receivedTokens.push(request.headers.authorization);
			let body = "";
			request.setEncoding("utf8");
			request.on("data", (chunk: string) => {
				body += chunk;
			});
			request.on("end", () => {
				const message = JSON.parse(body) as { id?: number; method: string };
				if (message.id === undefined) {
					response.writeHead(202).end();
					return;
				}
				const result =
					message.method === "initialize"
						? {
								protocolVersion: "2025-11-25",
								capabilities: { tools: {} },
								serverInfo: { name: "fixture", version: "1" },
							}
						: { tools: [{ name: "fixture_read", inputSchema: { type: "object" } }] };
				response.writeHead(200, { "content-type": "application/json" });
				response.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }));
			});
		});
		await new Promise<void>((resolve) => {
			server.listen(0, "127.0.0.1", resolve);
		});
		const address = server.address();
		if (address === null || typeof address === "string") throw new Error("MCP fixture did not bind a port");
		const client = new Client({ name: "bolt-test", version: "1" });
		try {
			await client.connect(
				new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`), { authProvider: provider }),
			);
			expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(["fixture_read"]);
			expect(receivedTokens.length).toBeGreaterThanOrEqual(3);
			expect(receivedTokens.every((token) => token?.startsWith("Bearer fixture-") === true)).toBe(true);
			expect(new Set(receivedTokens).size).toBe(receivedTokens.length);
		} finally {
			await client.close();
			await new Promise<void>((resolve, reject) => {
				server.close((error) => {
					if (error) reject(error);
					else resolve();
				});
			});
		}
	});

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

describe("Bolt's sandbox tool registry", () => {
	it("omits public previews while retaining file, shell, image, and plugin tools", () => {
		const code = bundledSection(runner.source, "function createTools(", "// src/chat/runtime/report-progress.ts");
		const factories = [...code.matchAll(/\b((?:create|get)\w+)\(/gu)].map((match) => match[1]!);
		const createPreviewTool = vi.fn();
		const createPreview = vi.fn();
		const create = new Script(`${code}\ncreateTools`).runInNewContext({
			...Object.fromEntries(factories.map((name) => [name, () => ({})])),
			botConfig: {},
			disableTools: (tools: object) => tools,
			getSlackToolContext: () => {},
			getPluginTools: () => ({ boltPluginTool: {} }),
			createCreatePreviewTool: createPreviewTool,
		}) as (skills: object[], hooks: object, context: object) => Record<string, unknown>;
		const tools = create(
			[],
			{},
			{
				conversationPrivacy: "private",
				supportsImageInput: true,
				workspace: { createPreview },
			},
		);
		expect(tools).not.toHaveProperty("createPreview");
		for (const name of ["bash", "readFile", "writeFile", "viewImage", "boltPluginTool"]) {
			expect(tools).toHaveProperty(name);
		}
		expect(createPreviewTool).not.toHaveBeenCalled();
		expect(createPreview).not.toHaveBeenCalled();
	});
});
