import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { config } from "../src/config.ts";
import { juniorBundle } from "./junior-bundle.ts";

const client = juniorBundle("client-");
const exportName = /resolveGatewayModel as (\w+)/u.exec(client.source)?.[1];
if (exportName === undefined) throw new Error("Junior no longer exports its gateway model resolver");
const clientModule = (await import(pathToFileURL(client.path).href)) as Record<string, unknown>;
const resolveGatewayModel = clientModule[exportName] as (id: string) => {
	id: string;
	provider: string;
	reasoning: boolean;
	contextWindow: number;
};

describe("Bolt's gateway model", () => {
	it("resolves the configured model through Junior's runtime catalog", () => {
		const model = resolveGatewayModel(config.BOLT_MODEL_ID);
		expect(model.id).toBe(config.BOLT_MODEL_ID);
		expect(model.provider).toBe("vercel-ai-gateway");
		expect(model.reasoning).toBe(true);
		expect(model.contextWindow).toBeGreaterThan(0);
	});

	it("preserves Kimi's transport, capabilities, limits, and cost reporting", () => {
		expect(resolveGatewayModel("moonshotai/kimi-k3.1-pro")).toMatchObject({
			id: "moonshotai/kimi-k3.1-pro",
			api: "anthropic-messages",
			provider: "vercel-ai-gateway",
			baseUrl: "https://ai-gateway.vercel.sh",
			reasoning: true,
			input: ["text", "image"],
			cost: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2 },
			contextWindow: 1048576,
			maxTokens: 1048576,
		});
	});
});
