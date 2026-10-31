import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { config } from "../src/config.ts";

const require = createRequire(import.meta.url);
// Junior 0.266.0's resolver is internal; exercise the same bundled function used by agent turns.
const clientUrl = pathToFileURL(join(dirname(require.resolve("@sentry/junior")), "client-B0YZfxNy.js"));
const { s: resolveGatewayModel } = (await import(clientUrl.href)) as {
	s: (id: string) => { id: string; provider: string; reasoning: boolean; contextWindow: number };
};

describe("Bolt's gateway model", () => {
	it("resolves the configured model through Junior's runtime catalog", () => {
		const model = resolveGatewayModel(config.BOLT_MODEL_ID);
		expect(model.id).toBe(config.BOLT_MODEL_ID);
		expect(model.provider).toBe("vercel-ai-gateway");
		expect(model.reasoning).toBe(true);
		expect(model.contextWindow).toBeGreaterThan(0);
	});
});
