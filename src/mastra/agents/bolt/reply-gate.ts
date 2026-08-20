import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { config } from "../../../config.ts";

const replyDecision = z.object({
	shouldReply: z.boolean(),
	reason: z.string().min(1),
});

export const replyGateAgent = new Agent({
	id: "bolt-reply-gate",
	name: "Bolt Reply Gate",
	description: "Decides whether Bolt should reply to an unmentioned message in a subscribed Slack thread",
	model: `vercel/${config.BOLT_REPLY_GATE_MODEL_ID}`,
	instructions: `Decide whether Bolt, Team 581's software assistant, should reply to the latest message in a Slack thread.

Reply only when the latest message contains a request or question specifically directed to Bolt. The message must clearly ask Bolt to provide information, take an action, explain something, or continue or change Bolt's work.

Do not reply merely because Bolt is participating in the thread, the message is relevant to Bolt's work, Bolt could help, or the message refers to Bolt in the third person. Do not reply to requests or questions directed at another person or the group, casual acknowledgements, thanks, conversation between humans, or status updates.

Default to not replying. If it is ambiguous whether the latest request or question is directed to Bolt, do not reply.`,
	defaultOptions: {
		maxSteps: 1,
		modelSettings: { reasoning: "medium" },
	},
});

export async function decideWhetherBoltShouldReply(conversation: string): Promise<boolean> {
	const { object } = await replyGateAgent.generate(
		`Here are the most recent messages in chronological order. Decide whether Bolt should reply to the latest one.\n\n${conversation}`,
		{
			structuredOutput: { schema: replyDecision },
		},
	);

	return object.shouldReply;
}
