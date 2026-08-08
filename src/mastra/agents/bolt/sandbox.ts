import type { RequestContext } from "@mastra/core/request-context";
import type { CommandResult, ExecuteCommandOptions, SandboxFileInput } from "@mastra/core/workspace";
import { DaytonaSandbox, type DaytonaSandboxOptions } from "@mastra/daytona";
import { createHash } from "node:crypto";
import type { Message } from "chat";
import { config } from "../../../config.ts";
import { createGitHubInstallationToken, revokeGitHubInstallationToken } from "../../../github-app.ts";
import { reportError } from "../../../sentry.ts";

const SANDBOX_TIMEOUT_MS = 30 * 60 * 1_000;
const SANDBOX_SETUP_TIMEOUT_MS = 5 * 60 * 1_000;
const SANDBOX_AUTO_DELETE_MINUTES = 24 * 60;
const SANDBOX_SNAPSHOT = "bolt-sandbox";
const REPOSITORY_PULL_FAILURE_MARKER = "[bolt] Failed to update sandbox repository.";

export const BOLT_SANDBOX_CONTEXT_KEY = "bolt.sandbox";
export const BOLT_SLACK_THREAD_CONTEXT_KEY = "bolt.slackThreadId";

export interface BoltSandbox {
	stop(): Promise<void>;
	executeCommand(command: string, args?: string[], options?: ExecuteCommandOptions): Promise<CommandResult>;
	writeFiles(files: SandboxFileInput[]): Promise<void>;
}

export interface SandboxDependencies {
	createSandbox(threadKey: string, githubToken: string): BoltSandbox;
	createGitHubToken(): Promise<string>;
	revokeGitHubToken(token: string): Promise<void>;
	report(error: unknown, message: string, context?: Record<string, unknown>): void;
}

const defaultDependencies: SandboxDependencies = {
	createSandbox: createDaytonaSandbox,
	createGitHubToken: createGitHubInstallationToken,
	revokeGitHubToken: revokeGitHubInstallationToken,
	report: reportError,
};

export function slackConversationId(threadId: string): string {
	return `slack:${threadId}`;
}

export function sandboxIdentity(threadKey: string): string {
	const workspaceKey = createHash("sha256").update(threadKey).digest("base64url");
	return `bolt-${workspaceKey}`;
}

export function sanitizeFilename(filename: string): string {
	return filename.replaceAll(/[^A-Za-z0-9._-]/gu, "_");
}

export async function withBoltSandbox<T>(
	options: {
		threadId: string;
		messages: Message[];
		requestContext: RequestContext;
		run(): Promise<T>;
	},
	dependencies: SandboxDependencies = defaultDependencies,
): Promise<T> {
	const threadKey = slackConversationId(options.threadId);
	let githubToken: string | undefined;
	let sandbox: BoltSandbox | undefined;

	try {
		githubToken = await dependencies.createGitHubToken();
		sandbox = dependencies.createSandbox(threadKey, githubToken);
		await setupSandbox(sandbox, threadKey, dependencies);
		await uploadWpilogAttachments(sandbox, options.messages);

		options.requestContext.set(BOLT_SANDBOX_CONTEXT_KEY, sandbox);
		options.requestContext.set(BOLT_SLACK_THREAD_CONTEXT_KEY, options.threadId);
		return await options.run();
	} finally {
		if (sandbox !== undefined) {
			try {
				await sandbox.stop();
			} catch (error) {
				dependencies.report(error, "Failed to stop Daytona sandbox", { threadKey });
			}
		}
		if (githubToken !== undefined) {
			try {
				await dependencies.revokeGitHubToken(githubToken);
			} catch (error) {
				dependencies.report(error, "Failed to revoke sandbox GitHub token", { threadKey });
			}
		}
	}
}

function createDaytonaSandbox(threadKey: string, githubToken: string): DaytonaSandbox {
	const id = sandboxIdentity(threadKey);
	return new AuthenticatedDaytonaSandbox(
		{
			id,
			name: id,
			apiKey: config.DAYTONA_API_KEY,
			apiUrl: config.DAYTONA_API_URL,
			target: config.DAYTONA_TARGET,
			snapshot: SANDBOX_SNAPSHOT,
			user: "root",
			timeout: SANDBOX_TIMEOUT_MS,
			autoStopInterval: 5,
			autoDeleteInterval: SANDBOX_AUTO_DELETE_MINUTES,
			labels: { "bolt-thread": id.slice("bolt-".length) },
		},
		{ GH_TOKEN: githubToken },
	);
}

async function setupSandbox(sandbox: BoltSandbox, threadKey: string, dependencies: SandboxDependencies): Promise<void> {
	const setup = await sandbox.executeCommand("/usr/local/libexec/bolt-sandbox-setup", [], {
		cwd: "/workspace",
		env: {
			GITHUB_APP_BOT_EMAIL: config.GITHUB_APP_BOT_EMAIL,
			GITHUB_APP_BOT_NAME: config.GITHUB_APP_BOT_NAME,
		},
		timeout: SANDBOX_SETUP_TIMEOUT_MS,
	});
	if (setup.exitCode !== 0) throw new Error("Sandbox setup failed.", { cause: setup });
	if (setup.stderr.includes(REPOSITORY_PULL_FAILURE_MARKER)) {
		dependencies.report(
			new Error(REPOSITORY_PULL_FAILURE_MARKER, { cause: setup.stderr }),
			"Failed to update sandbox repository",
			{
				threadKey,
			},
		);
	}
}

class AuthenticatedDaytonaSandbox extends DaytonaSandbox {
	constructor(
		options: DaytonaSandboxOptions,
		private readonly commandEnv: NodeJS.ProcessEnv,
	) {
		super(options);
	}

	override executeCommand(command: string, args?: string[], options?: ExecuteCommandOptions): Promise<CommandResult> {
		return super.executeCommand(command, args, {
			...options,
			env: { ...options?.env, ...this.commandEnv },
		});
	}
}

async function uploadWpilogAttachments(sandbox: BoltSandbox, messages: Message[]): Promise<void> {
	const files: SandboxFileInput[] = [];
	for (const message of messages) {
		for (const [attachmentIndex, attachment] of message.attachments.entries()) {
			const filename = attachment.name;
			if (filename === undefined || !filename.toLowerCase().endsWith(".wpilog")) continue;
			if (attachment.fetchData === undefined) throw new Error(`Slack attachment ${filename} cannot be downloaded.`);

			const messageId = sanitizeFilename(message.id);
			const safeName = sanitizeFilename(filename);
			files.push({
				path: `/workspace/uploads/${messageId}-${attachmentIndex}-${safeName}`,
				content: await attachment.fetchData(),
			});
		}
	}

	if (files.length === 0) return;
	const mkdir = await sandbox.executeCommand("mkdir", ["-p", "/workspace/uploads"]);
	if (mkdir.exitCode !== 0) throw new Error("Failed to create the sandbox upload directory.", { cause: mkdir });
	await sandbox.writeFiles(files);
}
