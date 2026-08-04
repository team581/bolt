"use agent";
import { useInitialData, useInstruction, useModel, useSandbox, useTool } from "@flue/runtime";
import { ModalClient } from "modal";
import * as v from "valibot";
import soul from "./bolt/SOUL.md";
import world from "./bolt/WORLD.md";
import { replyInThread } from "../channels/slack.ts";
import { modal } from "../sandboxes/modal.ts";

const slackInitialData = v.object({
	channelId: v.string(),
	threadTs: v.string(),
	startedBy: v.optional(v.string()),
	startedAt: v.pipe(v.string(), v.isoTimestamp()),
});

export function Bolt() {
	useModel("vercel-ai-gateway/alibaba/qwen3.8-max", { thinkingLevel: "high" });

	useInstruction(soul);
	useInstruction(world);

	useSandbox({
		async createSessionEnv(options) {
			const client = new ModalClient();
			const app = await client.apps.fromName("bolt", { createIfMissing: true });
			const image = client.images.fromRegistry("node:24-slim");
			const sandbox = await client.sandboxes.create(app, image);
			return modal(sandbox).createSessionEnv(options);
		},
	});

	const slack = useInitialData<v.InferOutput<typeof slackInitialData> | undefined>();
	if (slack) {
		useTool(replyInThread(slack));
		const startedBy = slack.startedBy ? ` by <@${slack.startedBy}>` : "";
		return `This conversation started${startedBy} in Slack at ${slack.startedAt}. Always send your complete user-facing response with reply_in_slack_thread.`;
	}
}

Bolt.initialData = v.optional(slackInitialData);
