import { agentConfig } from "@mastra/core/agent";
import { config } from "../../../config.ts";
import { createBoltChannels } from "./channels.ts";
import { BOLT_MAX_STEPS } from "./processors/input/ensure-final-response.ts";
import { boltChatChannelOutputProcessor } from "./processors/output/channel-render.ts";

export default agentConfig({
	id: "bolt",
	name: "Bolt",
	description: "FRC Team 581's software subteam Slack assistant",
	model: `vercel/${config.BOLT_MODEL_ID}`,
	durable: true,
	defaultOptions: {
		maxSteps: BOLT_MAX_STEPS,
		modelSettings: { reasoning: "high" },
	},
	outputProcessors: [boltChatChannelOutputProcessor],
	channels: createBoltChannels(),
});
