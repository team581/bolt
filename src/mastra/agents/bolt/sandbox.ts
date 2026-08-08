import type { RequestContext } from "@mastra/core/request-context";
import type { CommandResult, ExecuteCommandOptions, SandboxFileInput } from "@mastra/core/workspace";
import { DaytonaSandbox } from "@mastra/daytona";
import { createHash } from "node:crypto";
import type { Message } from "chat";
import { config } from "../../../config.ts";
import { createGitHubInstallationToken, revokeGitHubInstallationToken } from "../../../github-app.ts";
import { reportError } from "../../../sentry.ts";

const SANDBOX_TIMEOUT_MS = 30 * 60 * 1_000;
const SANDBOX_SETUP_TIMEOUT_MS = 5 * 60 * 1_000;
const REPOSITORY_PULL_FAILURE_MARKER = "[bolt] Failed to update sandbox repository.";

export const BOLT_SANDBOX_CONTEXT_KEY = "bolt.sandbox";
export const BOLT_SLACK_THREAD_CONTEXT_KEY = "bolt.slackThreadId";
export const FALLBACK_SANDBOX_IMAGE = "ghcr.io/team581/bolt-sandbox:latest";

export interface BoltSandbox {
	_start(): Promise<void>;
	_stop(): Promise<void>;
	executeCommand(command: string, args?: string[], options?: ExecuteCommandOptions): Promise<CommandResult>;
	writeFiles(files: SandboxFileInput[]): Promise<void>;
}

export interface SandboxDependencies {
	sandboxImage: string;
	createSandbox(threadKey: string, githubToken: string, image: string): BoltSandbox;
	createGitHubToken(): Promise<string>;
	revokeGitHubToken(token: string): Promise<void>;
	report(error: unknown, message: string, context?: Record<string, unknown>): void;
}

const defaultDependencies: SandboxDependencies = {
	sandboxImage: config.BOLT_SANDBOX_IMAGE,
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

export function isDaytonaImageError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	return /\b(?:build|image|manifest|oci|pull|registry|snapshot)\b/iu.test(error.message);
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
		sandbox = await acquireSandbox(threadKey, githubToken, dependencies);
		await setupSandbox(sandbox, threadKey, dependencies);
		await uploadWpilogAttachments(sandbox, options.messages);

		options.requestContext.set(BOLT_SANDBOX_CONTEXT_KEY, sandbox);
		options.requestContext.set(BOLT_SLACK_THREAD_CONTEXT_KEY, options.threadId);
		return await options.run();
	} finally {
		if (sandbox !== undefined) {
			try {
				await sandbox["_stop"]();
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

async function acquireSandbox(
	threadKey: string,
	githubToken: string,
	dependencies: SandboxDependencies,
): Promise<BoltSandbox> {
	let sandbox = dependencies.createSandbox(threadKey, githubToken, dependencies.sandboxImage);
	try {
		await sandbox["_start"]();
		return sandbox;
	} catch (error) {
		await stopFailedSandbox(sandbox, threadKey, dependencies);
		if (dependencies.sandboxImage === FALLBACK_SANDBOX_IMAGE || !isDaytonaImageError(error)) throw error;

		dependencies.report(error, "Failed to create Daytona sandbox from configured image; falling back to latest", {
			fallbackImage: FALLBACK_SANDBOX_IMAGE,
			image: dependencies.sandboxImage,
			threadKey,
		});
		sandbox = dependencies.createSandbox(threadKey, githubToken, FALLBACK_SANDBOX_IMAGE);
		try {
			await sandbox["_start"]();
			return sandbox;
		} catch (fallbackError) {
			await stopFailedSandbox(sandbox, threadKey, dependencies);
			throw fallbackError;
		}
	}
}

function createDaytonaSandbox(threadKey: string, githubToken: string, image: string): DaytonaSandbox {
	const id = sandboxIdentity(threadKey);
	return new DaytonaSandbox({
		id,
		name: id,
		apiKey: config.DAYTONA_API_KEY,
		apiUrl: config.DAYTONA_API_URL,
		target: config.DAYTONA_TARGET,
		image,
		resources: { cpu: 2, memory: 4 },
		user: "root",
		timeout: SANDBOX_TIMEOUT_MS,
		autoStopInterval: 5,
		autoDeleteInterval: -1,
		labels: { "bolt-thread": sandboxIdentity(threadKey).slice("bolt-".length) },
		env: {
			GH_TOKEN: githubToken,
			GITHUB_APP_BOT_EMAIL: config.GITHUB_APP_BOT_EMAIL,
			GITHUB_APP_BOT_NAME: config.GITHUB_APP_BOT_NAME,
			GRADLE_RO_DEP_CACHE: "/opt/bolt/gradle-dependencies",
			GRADLE_USER_HOME: "/workspace/.gradle",
		},
	});
}

async function setupSandbox(sandbox: BoltSandbox, threadKey: string, dependencies: SandboxDependencies): Promise<void> {
	const setup = await sandbox.executeCommand("/usr/local/libexec/bolt-sandbox-setup", [], {
		cwd: "/workspace",
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

async function stopFailedSandbox(
	sandbox: BoltSandbox,
	threadKey: string,
	dependencies: SandboxDependencies,
): Promise<void> {
	try {
		await sandbox["_stop"]();
	} catch (error) {
		dependencies.report(error, "Failed to stop Daytona sandbox after startup failure", { threadKey });
	}
}
