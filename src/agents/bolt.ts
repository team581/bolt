"use agent";
import { useModel, useSandbox } from "@flue/runtime";
import { ModalClient } from "modal";
import { modal } from "../sandboxes/modal.ts";

export function Bolt() {
	useModel("vercel-ai-gateway/openai/gpt-5.6-terra", { thinkingLevel: "medium" });
	useSandbox({
		async createSessionEnv(options) {
			const client = new ModalClient();
			const app = await client.apps.fromName("bolt", { createIfMissing: true });
			const image = client.images.fromRegistry("node:24-slim");
			const sandbox = await client.sandboxes.create(app, image);
			return modal(sandbox).createSessionEnv(options);
		},
	});
	return "You are a helpful assistant. Keep replies short.";
}
