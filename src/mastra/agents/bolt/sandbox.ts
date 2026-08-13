import type { RequestContext } from "@mastra/core/request-context";
import type { CommandResult, ExecuteCommandOptions, MountResult, SandboxFileInput } from "@mastra/core/workspace";
import { DaytonaSandbox, type DaytonaSandboxOptions } from "@mastra/daytona";
import { createHash } from "node:crypto";
import type { Message } from "chat";
import { config } from "../../../config.ts";
import { createGitHubInstallationToken, revokeGitHubInstallationToken } from "../../../github-app.ts";
import { reportError } from "../../../sentry.ts";
import { createFetchFilesystem, FETCH_GCS_MOUNT_PATH } from "./fetch-filesystem.ts";

const SANDBOX_TIMEOUT_MS = 30 * 60 * 1_000;
const SANDBOX_SETUP_TIMEOUT_MS = 5 * 60 * 1_000;
const SANDBOX_AUTO_DELETE_MINUTES = 24 * 60;
const SANDBOX_SNAPSHOT = "bolt-sandbox";
const REPOSITORY_PULL_FAILURE_MARKER = "[bolt] Failed to update sandbox repository.";

export const BOLT_SLACK_THREAD_CONTEXT_KEY = "bolt.slackThreadId";

interface SandboxSession {
	sandbox: DaytonaSandbox;
	githubToken: string;
	threadKey: string;
}

const activeSandboxSessions = new WeakMap<RequestContext, SandboxSession>();

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

export async function withBoltSandbox<T>(options: {
	threadId: string;
	messages: Message[];
	requestContext: RequestContext;
	run(): Promise<T>;
}): Promise<T> {
	let session: SandboxSession | undefined;

	try {
		options.requestContext.set(BOLT_SLACK_THREAD_CONTEXT_KEY, options.threadId);
		session = await resolveSandboxSession(options.requestContext);
		await uploadWpilogAttachments(session.sandbox, options.messages);
		return await options.run();
	} finally {
		activeSandboxSessions.delete(options.requestContext);
		if (session !== undefined) await cleanupSandbox(session);
	}
}

export async function resolveBoltSandbox(requestContext: RequestContext): Promise<DaytonaSandbox> {
	return (await resolveSandboxSession(requestContext)).sandbox;
}

async function resolveSandboxSession(requestContext: RequestContext): Promise<SandboxSession> {
	const activeSession = activeSandboxSessions.get(requestContext);
	if (activeSession !== undefined) return activeSession;

	const slackThreadId = requestContext.get<string, string | undefined>(BOLT_SLACK_THREAD_CONTEXT_KEY);
	if (slackThreadId === undefined) throw new Error("Bolt's Slack thread is not available for this request.");

	const threadKey = slackConversationId(slackThreadId);
	const githubToken = await createGitHubInstallationToken();
	const session = { sandbox: createDaytonaSandbox(threadKey, githubToken), githubToken, threadKey };
	try {
		await setupSandbox(session.sandbox, threadKey);
	} catch (error) {
		await cleanupSandbox(session);
		throw error;
	}

	activeSandboxSessions.set(requestContext, session);
	return session;
}

async function cleanupSandbox({ sandbox, githubToken, threadKey }: SandboxSession): Promise<void> {
	try {
		await sandbox.stop();
	} catch (error) {
		reportError(error, "Failed to stop Daytona sandbox", { threadKey });
	}
	try {
		await revokeGitHubInstallationToken(githubToken);
	} catch (error) {
		reportError(error, "Failed to revoke sandbox GitHub token", { threadKey });
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

async function setupSandbox(sandbox: DaytonaSandbox, threadKey: string): Promise<void> {
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
		reportError(
			new Error(REPOSITORY_PULL_FAILURE_MARKER, { cause: setup.stderr }),
			"Failed to update sandbox repository",
			{
				threadKey,
			},
		);
	}

	let mount: MountResult;
	try {
		mount = await sandbox.mount(createFetchFilesystem(), FETCH_GCS_MOUNT_PATH);
	} finally {
		// Delete the GCP service account key files which are stored in the sandbox
		await sandbox.executeCommand("rm -f /tmp/gcs-key-*.json");
	}
	if (!mount.success) throw new Error("Failed to mount the Fetch GCS bucket.", { cause: mount.error });
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

async function uploadWpilogAttachments(sandbox: DaytonaSandbox, messages: Message[]): Promise<void> {
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
