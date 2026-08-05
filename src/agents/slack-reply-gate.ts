import { generateText, Output } from "ai";
import * as v from "valibot";
import { config } from "../config.ts";

const replyDecision = v.object({
	shouldReply: v.boolean(),
	reason: v.pipe(v.string(), v.minLength(1)),
});

export async function decideWhetherBoltShouldReply(conversation: string): Promise<boolean> {
	const { output } = await generateText({
		model: config.BOLT_REPLY_GATE_MODEL_ID,
		output: Output.object({
			name: "slack_reply_decision",
			description: "Whether Bolt should respond to the latest message in a Slack thread.",
			schema: replyDecision,
		}),
		providerOptions: config.BOLT_REPLY_GATE_MODEL_ID.startsWith("openai/")
			? { openai: { reasoningEffort: "medium" } }
			: undefined,
		system: `Decide whether Bolt, Team 581's software assistant, should reply to the latest message in a Slack thread.

Reply when the latest message asks Bolt a question, requests information or an action from Bolt, follows up on Bolt's work, reports that Bolt's answer did not work, or otherwise clearly expects Bolt to continue.

Do not reply to casual acknowledgements, thanks, conversation between humans, status updates that need no action, or messages where a Bolt response would add no value. When uncertain, reply.`,
		prompt: `Here are the most recent messages in chronological order. Decide whether Bolt should reply to the latest one.\n\n${conversation}`,
	});

	return output.shouldReply;
}
