import { AgentRunError } from "@flue/runtime";
import type { AgentInstanceHandle, ConversationStreamChunk, DispatchReceipt } from "@flue/runtime";
import type { StreamChunk } from "chat";
import { reportError } from "../sentry.ts";

export function streamAgentReply(agent: AgentInstanceHandle, receipt: DispatchReceipt): AsyncIterable<StreamChunk> {
	const activeTools = new Map<string, string>();
	const seenPositions = new Set<string>();
	let cancelled = false;
	let responseMessageId: string | undefined;

	const readReply = async (controller: ReadableStreamDefaultController<StreamChunk>): Promise<void> => {
		try {
			const reply = await agent.read(receipt, {
				onEvent(event) {
					if (cancelled || isDuplicate(event, seenPositions)) return;

					if (event.type === "message-started" && event.submissionId === receipt.submissionId) {
						responseMessageId = event.messageId;
					}
					const chunk = projectToolEvent(event, responseMessageId, activeTools);
					if (chunk) controller.enqueue(chunk);
				},
			});
			if (cancelled) return;
			controller.enqueue({ type: "markdown_text", text: reply.text || "Done." });
			controller.close();
		} catch (error) {
			// Failed Flue runs are captured by the global Flue/Sentry instrumentation.
			if (!(error instanceof AgentRunError)) {
				reportError(error, "Failed to read Bolt agent reply", { submissionId: receipt.submissionId });
			}
			if (cancelled) return;
			for (const [id, title] of activeTools) {
				controller.enqueue({ type: "task_update", id, title, status: "error", details: "Step failed" });
			}
			controller.enqueue({
				type: "markdown_text",
				text:
					error instanceof AgentRunError && error.outcome === "aborted"
						? "I stopped working on that request."
						: "I ran into an error while working on that. Please try again.",
			});
			controller.close();
		}
	};

	return new ReadableStream<StreamChunk>({
		start(controller) {
			void readReply(controller);
		},
		cancel() {
			cancelled = true;
		},
	});
}

function projectToolEvent(
	event: ConversationStreamChunk,
	responseMessageId: string | undefined,
	activeTools: Map<string, string>,
): StreamChunk | undefined {
	if (event.type === "tool-input") {
		if (event.messageId !== responseMessageId) return undefined;
		const title = toolTitle(event.toolName);
		activeTools.set(event.toolCallId, title);
		return { type: "task_update", id: event.toolCallId, title, status: "in_progress" };
	}
	if (event.type !== "tool-output" && event.type !== "tool-output-error") return undefined;

	const title = activeTools.get(event.toolCallId);
	if (title === undefined || title.length === 0) return undefined;
	activeTools.delete(event.toolCallId);
	return event.type === "tool-output"
		? { type: "task_update", id: event.toolCallId, title, status: "complete" }
		: { type: "task_update", id: event.toolCallId, title, status: "error", details: "Step failed" };
}

function isDuplicate(event: ConversationStreamChunk, seenPositions: Set<string>): boolean {
	const position = `${event.position.batch}:${event.position.index}`;
	if (seenPositions.has(position)) return true;
	seenPositions.add(position);
	return false;
}

function toolTitle(toolName: string): string {
	const titles: Record<string, string> = {
		bash: "Running a command",
		edit: "Editing a file",
		glob: "Finding files",
		grep: "Searching files",
		read: "Reading a file",
		write: "Writing a file",
		activate_skill: "Activating a skill",
		read_skill_resource: "Reading a skill resource",
	};
	return titles[toolName] ?? `Using ${toolName.replaceAll("_", " ")}`;
}
