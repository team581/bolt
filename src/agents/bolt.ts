"use agent";
import {
	type AgentProps,
	useAgentStart,
	useDelivery,
	useInitialData,
	useInstruction,
	useModel,
	useSkill,
} from "@flue/runtime";
import * as v from "valibot";
import instructions from "./bolt/INSTRUCTIONS.md";
import analyzeWpilog from "./bolt/skills/analyze-wpilog/SKILL.md";
import manageGithubProjects from "./bolt/skills/manage-github-projects/SKILL.md";
import { useBoltSandbox } from "./bolt/use-sandbox.ts";
import { fetchSlackMessageAttachments } from "../channels/slack-adapter.ts";
import { config } from "../config.ts";

const slackInitialData = v.object({
	channelId: v.string(),
	threadId: v.string(),
	isDM: v.boolean(),
	startedBy: v.optional(v.string()),
	startedAt: v.pipe(v.string(), v.isoTimestamp()),
});

export function Bolt({ id }: AgentProps) {
	useModel(`vercel-ai-gateway/${config.BOLT_MODEL_ID}`, { thinkingLevel: "high" });
	useBoltSandbox(id);
	useSkill(analyzeWpilog);
	useSkill(manageGithubProjects);

	const slack = useInitialData<v.InferOutput<typeof slackInitialData> | undefined>();
	const delivery = useDelivery();
	if (slack) {
		const attachmentMessageIds = getAttachmentMessageIds(delivery);
		if (attachmentMessageIds.length > 0) {
			useAgentStart(async ({ append, harness }) => {
				const files = [];
				for (const messageId of attachmentMessageIds) {
					const attachments = await fetchSlackMessageAttachments(slack.threadId, messageId);
					for (const [attachmentIndex, attachment] of attachments.entries()) {
						const filename = attachment.name;
						if (!filename?.toLowerCase().endsWith(".wpilog")) continue;
						if (!attachment.fetchData) throw new Error(`Slack attachment ${filename} cannot be downloaded.`);

						const safeName = filename.replace(/[^A-Za-z0-9._-]/g, "_");
						const path = harness.sandbox.resolvePath(`uploads/${messageId}-${attachmentIndex}-${safeName}`);
						const bytes = await attachment.fetchData();
						await harness.sandbox.writeFile(path, new Uint8Array(bytes));
						files.push({ path, filename, size: bytes.byteLength, mimeType: attachment.mimeType });
					}
				}

				if (files.length > 0) {
					append({
						kind: "signal",
						type: "slack.attachments.ready",
						body: JSON.stringify(files),
						attributes: { count: String(files.length) },
					});
				}
			});
		}
		const startedBy = slack.startedBy ? ` by <@${slack.startedBy}>` : "";
		useInstruction(
			`This conversation started${startedBy} in ${slack.isDM ? "a Slack DM" : "a Slack thread"} at ${slack.startedAt}. Your response is streamed to Slack automatically.`,
		);
	}

	return instructions;
}

Bolt.initialData = v.optional(slackInitialData);

function getAttachmentMessageIds(delivery: ReturnType<typeof useDelivery>): string[] {
	if (delivery.kind !== "signal" || delivery.type !== "slack.message") return [];
	const encoded = delivery.attributes?.attachmentMessageIds;
	if (!encoded) return [];

	try {
		const parsed: unknown = JSON.parse(encoded);
		return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
	} catch {
		return [];
	}
}
