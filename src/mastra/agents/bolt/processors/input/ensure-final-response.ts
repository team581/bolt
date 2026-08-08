import type { Processor, ProcessInputStepArgs } from "@mastra/core/processors";

export const BOLT_MAX_STEPS = 50;

export class EnsureFinalResponseProcessor implements Processor {
	readonly id = "ensure-final-response";

	constructor(private readonly maxSteps: number) {}

	async processInputStep({ stepNumber, sendSignal }: ProcessInputStepArgs): Promise<void> {
		if (stepNumber !== this.maxSteps - 1) return;

		await sendSignal?.({
			type: "reactive",
			contents:
				`This is your final step (step ${stepNumber + 1} of ${this.maxSteps}). ` +
				"Do not call any more tools. Summarize what you have found and give the user a complete final answer now.",
			attributes: { reason: "max-steps-reached", step: stepNumber + 1 },
			transient: true,
		});
	}
}

export default new EnsureFinalResponseProcessor(BOLT_MAX_STEPS);
