import { AgentRunError } from "@flue/runtime";
import type { AgentInstanceHandle, ConversationStreamChunk, DispatchReceipt } from "@flue/runtime";
import type { StreamChunk } from "chat";

export function streamAgentReply(agent: AgentInstanceHandle, receipt: DispatchReceipt): AsyncIterable<StreamChunk> {
	return {
		async *[Symbol.asyncIterator]() {
			const queue: StreamChunk[] = [];
			const activeTools = new Map<string, string>();
			const seenPositions = new Set<string>();
			let wake: (() => void) | undefined;
			let finished = false;
			let streamedText = "";
			let needsParagraph = false;
			let responseMessageId: string | undefined;

			const emit = (chunk: StreamChunk): void => {
				queue.push(chunk);
				wake?.();
				wake = undefined;
			};
			const emitText = (text: string): void => {
				if (!text) return;
				streamedText += text;
				emit({ type: "markdown_text", text });
			};

			const read = agent
				.read(receipt, {
					onEvent(event) {
						const position = `${event.position.batch}:${event.position.index}`;
						if (seenPositions.has(position)) return;
						seenPositions.add(position);

						if (event.type === "message-started") {
							if (event.submissionId === receipt.submissionId) responseMessageId = event.messageId;
							else if (event.messageId !== responseMessageId) return;
						} else if (event.type === "message-delta" || event.type === "tool-input") {
							if (event.messageId !== responseMessageId) return;
						} else if (
							(event.type === "tool-output" || event.type === "tool-output-error") &&
							!activeTools.has(event.toolCallId)
						) {
							return;
						}

						projectAgentEvent(event, {
							activeTools,
							emit,
							emitText,
							get needsParagraph() {
								return needsParagraph;
							},
							set needsParagraph(value: boolean) {
								needsParagraph = value;
							},
							get streamedText() {
								return streamedText;
							},
						});
					},
				})
				.then((reply) => {
					if (!streamedText) emitText(reply.text || "Done.");
					else if (reply.text.startsWith(streamedText)) emitText(reply.text.slice(streamedText.length));
				})
				.catch((error: unknown) => {
					console.error("Bolt agent run failed", error);
					for (const [id, title] of activeTools) {
						emit({ type: "task_update", id, title, status: "error", details: "Step failed" });
					}
					if (streamedText) emitText("\n\n");
					emitText(
						error instanceof AgentRunError && error.outcome === "aborted"
							? "I stopped working on that request."
							: "I ran into an error while working on that. Please try again.",
					);
				})
				.finally(() => {
					finished = true;
					wake?.();
					wake = undefined;
				});

			while (!finished || queue.length > 0) {
				const chunk = queue.shift();
				if (chunk) {
					yield chunk;
					continue;
				}
				await new Promise<void>((resolve) => {
					wake = resolve;
				});
			}
			await read;
		},
	};
}

interface AgentEventProjection {
	activeTools: Map<string, string>;
	emit(chunk: StreamChunk): void;
	emitText(text: string): void;
	needsParagraph: boolean;
	readonly streamedText: string;
}

function projectAgentEvent(event: ConversationStreamChunk, output: AgentEventProjection): void {
	switch (event.type) {
		case "message-started":
			if (output.streamedText) output.needsParagraph = true;
			break;
		case "message-delta":
			if (event.kind !== "text") break;
			if (output.needsParagraph) output.emitText("\n\n");
			output.needsParagraph = false;
			output.emitText(event.delta);
			break;
		case "tool-input": {
			const title = toolTitle(event.toolName);
			output.activeTools.set(event.toolCallId, title);
			output.emit({ type: "task_update", id: event.toolCallId, title, status: "in_progress" });
			break;
		}
		case "tool-output": {
			const title = output.activeTools.get(event.toolCallId) ?? "Completed a step";
			output.activeTools.delete(event.toolCallId);
			output.emit({ type: "task_update", id: event.toolCallId, title, status: "complete" });
			break;
		}
		case "tool-output-error": {
			const title = output.activeTools.get(event.toolCallId) ?? "Running a step";
			output.activeTools.delete(event.toolCallId);
			output.emit({ type: "task_update", id: event.toolCallId, title, status: "error", details: "Step failed" });
			break;
		}
	}
}

function toolTitle(toolName: string): string {
	const titles: Record<string, string> = {
		bash: "Running a command",
		edit: "Editing a file",
		glob: "Finding files",
		grep: "Searching files",
		read: "Reading a file",
		write: "Writing a file",
	};
	return titles[toolName] ?? `Using ${toolName.replaceAll("_", " ")}`;
}
