import type { ProcessInputStepArgs } from "@mastra/core/processors";
import { describe, expect, it, vi } from "vite-plus/test";
import { EnsureFinalResponseProcessor } from "./ensure-final-response.ts";

describe("EnsureFinalResponseProcessor", () => {
	it("only reminds the model on its final step", async () => {
		const sendSignal = vi.fn(() => Promise.resolve());
		const processor = new EnsureFinalResponseProcessor(3);

		await processor.processInputStep({ stepNumber: 1, sendSignal } as unknown as ProcessInputStepArgs);
		expect(sendSignal).not.toHaveBeenCalled();

		await processor.processInputStep({ stepNumber: 2, sendSignal } as unknown as ProcessInputStepArgs);
		expect(sendSignal).toHaveBeenCalledWith({
			type: "reactive",
			contents:
				"This is your final step (step 3 of 3). " +
				"Do not call any more tools. Summarize what you have found and give the user a complete final answer now.",
			attributes: { reason: "max-steps-reached", step: 3 },
			transient: true,
		});
	});
});
