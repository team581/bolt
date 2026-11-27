import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";
import app from "../server.ts";
import { config } from "../src/config.ts";
import { juniorBundle } from "./junior-bundle.ts";

it("keeps Bolt's model and high reasoning after replacing model profiles", async () => {
	const bundle = juniorBundle("config-");
	const name = /getChatConfig as (\w+)/u.exec(bundle.source)?.[1];
	if (name === undefined) throw new Error("Junior no longer exports its runtime configuration");
	const module = (await import(pathToFileURL(bundle.path).href)) as Record<string, unknown>;
	const getChatConfig = module[name] as () => { bot: object };
	expect(getChatConfig().bot).toMatchObject({
		modelId: config.BOLT_MODEL_ID,
		reasoningLevel: "high",
		fastModelId: config.BOLT_REPLY_GATE_MODEL_ID,
		guardianModelId: config.BOLT_REPLY_GATE_MODEL_ID,
	});
});

it("restricts the actual Dashboard sign-in route to Team 581 Google Workspace accounts", async () => {
	const response = await app.fetch(new Request("https://bolt.example.com/auth/login?next=%2Fconversations"));
	expect(response.status).toBe(302);
	const redirect = new URL(response.headers.get("location")!);
	expect(redirect.origin).toBe("https://accounts.google.com");
	expect(redirect.searchParams.get("hd")).toBe("team581.com");
});
