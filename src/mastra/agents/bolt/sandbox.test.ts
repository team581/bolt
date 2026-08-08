import { RequestContext } from "@mastra/core/request-context";
import type { CommandResult, SandboxFileInput } from "@mastra/core/workspace";
import { Message } from "chat";
import { describe, expect, it } from "vite-plus/test";
import {
	BOLT_SANDBOX_CONTEXT_KEY,
	sandboxIdentity,
	sanitizeFilename,
	type BoltSandbox,
	type SandboxDependencies,
	slackConversationId,
	withBoltSandbox,
} from "./sandbox.ts";

const successfulCommand: CommandResult = {
	success: true,
	exitCode: 0,
	stdout: "",
	stderr: "",
	executionTimeMs: 1,
};

describe("Bolt Daytona sandbox", () => {
	it("creates stable Slack conversation and sandbox identities", () => {
		expect(slackConversationId("slack:C123:456.789")).toBe("slack:slack:C123:456.789");
		expect(sandboxIdentity("slack:slack:C123:456.789")).toBe(sandboxIdentity("slack:slack:C123:456.789"));
		expect(sandboxIdentity("slack:slack:C123:456.789")).not.toBe(sandboxIdentity("slack:slack:C123:other"));
	});

	it("sanitizes uploaded filenames", () => {
		expect(sanitizeFilename("match 1/../auto?.wpilog")).toBe("match_1_.._auto_.wpilog");
	});

	it("sets up the sandbox, uploads WPILOG files, and always cleans up", async () => {
		const events: string[] = [];
		const writes: SandboxFileInput[][] = [];
		const sandbox = fakeSandbox(events, writes);
		const dependencies = fakeDependencies(sandbox, events);
		const requestContext = new RequestContext();

		const result = await withBoltSandbox(
			{
				threadId: "slack:C123:456.789",
				messages: [messageWithWpilog("Match 1/Auto?.wpilog")],
				requestContext,
				run: () => {
					events.push("run");
					expect(requestContext.get(BOLT_SANDBOX_CONTEXT_KEY)).toBe(sandbox);
					return Promise.resolve("done");
				},
			},
			dependencies,
		);

		expect(result).toBe("done");
		expect(events).toEqual([
			"token:create",
			"exec:/usr/local/libexec/bolt-sandbox-setup",
			"exec:mkdir",
			"write",
			"run",
			"sandbox:stop",
			"token:revoke",
		]);
		expect(writes).toHaveLength(1);
		expect(writes[0]?.[0]?.path).toBe("/workspace/uploads/message-1-0-Match_1_Auto_.wpilog");
		expect(writes[0]?.[0]?.content).toEqual(Buffer.from("wpilog"));
	});

	it("stops the sandbox and revokes the token when the agent run fails", async () => {
		const events: string[] = [];
		const sandbox = fakeSandbox(events);

		await expect(
			withBoltSandbox(
				{
					threadId: "slack:C123:456.789",
					messages: [],
					requestContext: new RequestContext(),
					run: () => Promise.reject(new Error("agent failed")),
				},
				fakeDependencies(sandbox, events),
			),
		).rejects.toThrow("agent failed");

		expect(events.slice(-2)).toEqual(["sandbox:stop", "token:revoke"]);
	});
});

function fakeSandbox(events: string[], writes: SandboxFileInput[][] = []): BoltSandbox {
	return {
		stop: () => {
			events.push("sandbox:stop");
			return Promise.resolve();
		},
		executeCommand: (command) => {
			events.push(`exec:${command}`);
			return Promise.resolve(successfulCommand);
		},
		writeFiles: (files) => {
			events.push("write");
			writes.push(files);
			return Promise.resolve();
		},
	};
}

function fakeDependencies(sandbox: BoltSandbox, events: string[]): SandboxDependencies {
	return {
		createSandbox: () => sandbox,
		createGitHubToken: () => {
			events.push("token:create");
			return Promise.resolve("token");
		},
		revokeGitHubToken: () => {
			events.push("token:revoke");
			return Promise.resolve();
		},
		report: () => {},
	};
}

function messageWithWpilog(filename: string): Message {
	return new Message({
		id: "message-1",
		threadId: "thread-1",
		text: "Please analyze this log",
		formatted: { type: "root", children: [] },
		raw: {},
		author: {
			userId: "U123",
			userName: "student",
			fullName: "Student",
			isBot: false,
			isMe: false,
		},
		metadata: { dateSent: new Date(), edited: false },
		attachments: [
			{
				type: "file",
				name: filename,
				mimeType: "application/octet-stream",
				size: 6,
				fetchData: () => Promise.resolve(Buffer.from("wpilog")),
			},
		],
		links: [],
	});
}
