import type { OutputProcessor, ProcessOutputStreamArgs } from "@mastra/core/processors";
import type { ChunkType } from "@mastra/core/stream";

const renderers = new WeakMap<Record<string, unknown>, OutputProcessor>();

export const boltChatChannelOutputProcessor: OutputProcessor = {
	id: "chat-channel-render",
	processDataParts: true,
	async processOutputStream(args) {
		const renderer = getRenderer(args);
		if (renderer?.processOutputStream === undefined) return args.part;

		await renderer.processOutputStream(args);
		if (args.part.type === "finish") {
			// Mastra leaves ChatChannelOutputProcessor's queue open on run-level `finish`,
			// so Chat SDK never finalizes its placeholder. This private no-op `abort`
			// closes and awaits the renderer after forwarding the real terminal event.
			await renderer.processOutputStream({ ...args, part: terminalAbort(args.part) });
		}
		return args.part;
	},
};

export default boltChatChannelOutputProcessor;

function getRenderer(args: ProcessOutputStreamArgs): OutputProcessor | undefined {
	const existing = renderers.get(args.state);
	if (existing !== undefined) return existing;

	const renderer = args.agent
		?.getChannels()
		?.getOutputProcessors()
		.find(({ id }) => id === "chat-channel-render");
	if (renderer !== undefined) renderers.set(args.state, renderer);
	return renderer;
}

function terminalAbort(part: ChunkType): Extract<ChunkType, { type: "abort" }> {
	return {
		runId: part.runId,
		from: part.from,
		metadata: part.metadata,
		type: "abort",
		payload: {},
	};
}
