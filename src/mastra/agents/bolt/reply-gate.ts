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

Reply when the latest message asks Bolt a question, requests information or an action from Bolt, follows up on Bolt's work, reports that Bolt's answer did not work, or otherwise clearly expects Bolt to continue.

Do not reply to casual acknowledgements, thanks, conversation between humans, status updates that need no action, or messages where a Bolt response would add no value. When uncertain, reply.`,
	defaultOptions: {
		maxSteps: 1,
		modelSettings: { reasoning: "low" },
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
