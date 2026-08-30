import type { RequestContext } from "@mastra/core/request-context";
import type { MountResult, SandboxFileInput } from "@mastra/core/workspace";
import { DaytonaSandbox } from "@mastra/daytona";
import { createHash } from "node:crypto";
import type { Message } from "chat";
import { config } from "../../../config.ts";
import { createGitHubInstallationToken, revokeGitHubInstallationToken } from "../../../github-app.ts";
import { reportError } from "../../../sentry.ts";
import { createFetchFilesystem, FETCH_GCS_MOUNT_PATH } from "./fetch-filesystem.ts";

const SANDBOX_SETUP_TIMEOUT_MS = 5 * 60 * 1_000;
const SANDBOX_AUTO_STOP_MINUTES = 5;
const SANDBOX_AUTO_DELETE_MINUTES = 24 * 60;
const SANDBOX_SNAPSHOT = "bolt-sandbox";
const REPOSITORY_PULL_FAILURE_MARKER = "[bolt] Failed to update sandbox repository.";

const BOLT_SLACK_THREAD_CONTEXT_KEY = "bolt.slackThreadId";

interface SandboxSession {
	sandbox: CommandDaytonaSandbox;
	githubToken: string;
	threadKey: string;
}

type CommandDaytonaSandbox = DaytonaSandbox & {
	executeCommand: NonNullable<DaytonaSandbox["executeCommand"]>;
};

function supportsCommandExecution(sandbox: DaytonaSandbox): sandbox is CommandDaytonaSandbox {
	return sandbox.executeCommand !== undefined;
}

const activeSandboxPreparations = new WeakMap<RequestContext, Promise<SandboxSession>>();
const activeSandboxSetups = new Map<string, Promise<void>>();

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

export function withBoltSandbox<T>(options: {
	threadId: string;
	messages: Message[];
	requestContext: RequestContext;
	run(): Promise<T>;
}): Promise<T> {
	return withBoltSandboxContext({
		threadId: options.threadId,
		requestContext: options.requestContext,
		run: () => {
			void resolveSandboxSession(options.requestContext, options.messages);
			return options.run();
		},
	});
}

export async function withBoltSandboxContext<T>(options: {
	threadId: string;
	requestContext: RequestContext;
	run(): Promise<T>;
}): Promise<T> {
	try {
		options.requestContext.set(BOLT_SLACK_THREAD_CONTEXT_KEY, options.threadId);
		return await options.run();
	} finally {
		const preparation = activeSandboxPreparations.get(options.requestContext);
		activeSandboxPreparations.delete(options.requestContext);
		if (preparation !== undefined) {
			try {
				await revokeSandboxGitHubToken(await preparation);
			} catch {
				// Preparation failures are reported and credentials are revoked before rejection.
			}
		}
	}
}

export async function resolveBoltSandbox(requestContext: RequestContext): Promise<DaytonaSandbox> {
	return (await resolveSandboxSession(requestContext)).sandbox;
}

function resolveSandboxSession(requestContext: RequestContext, messages: Message[] = []): Promise<SandboxSession> {
	const activePreparation = activeSandboxPreparations.get(requestContext);
	if (activePreparation !== undefined) return activePreparation;

	const preparation = prepareSandboxSession(requestContext, messages);
	activeSandboxPreparations.set(requestContext, preparation);
	// A message may finish without using sandbox tools, so attach a rejection handler immediately.
	void preparation.catch(() => {});
	return preparation;
}

async function prepareSandboxSession(requestContext: RequestContext, messages: Message[]): Promise<SandboxSession> {
	const slackThreadId = requestContext.get<string, string | undefined>(BOLT_SLACK_THREAD_CONTEXT_KEY);
	if (slackThreadId === undefined) throw new Error("Bolt's Slack thread is not available for this request.");

	const threadKey = slackConversationId(slackThreadId);
	let session: SandboxSession | undefined;
	try {
		const githubToken = await createGitHubInstallationToken();
		session = { sandbox: createDaytonaSandbox(threadKey, githubToken), githubToken, threadKey };
		await setupSandboxOnce(session.sandbox, threadKey);
		await uploadWpilogAttachments(session.sandbox, messages);
		return session;
	} catch (error) {
		if (session !== undefined) await revokeSandboxGitHubToken(session);
		reportError(error, "Failed to prepare Daytona sandbox", { threadKey });
		throw error;
	}
}

async function setupSandboxOnce(sandbox: CommandDaytonaSandbox, threadKey: string): Promise<void> {
	const setup = activeSandboxSetups.getOrInsertComputed(threadKey, () => setupSandbox(sandbox, threadKey));
	try {
		await setup;
	} finally {
		if (activeSandboxSetups.get(threadKey) === setup) activeSandboxSetups.delete(threadKey);
	}
}

async function revokeSandboxGitHubToken({ githubToken, threadKey }: SandboxSession): Promise<void> {
	try {
		await revokeGitHubInstallationToken(githubToken);
	} catch (error) {
		reportError(error, "Failed to revoke sandbox GitHub token", { threadKey });
	}
}

function createDaytonaSandbox(threadKey: string, githubToken: string): CommandDaytonaSandbox {
	const id = sandboxIdentity(threadKey);
	const sandbox = new DaytonaSandbox({
		id,
		name: id,
		apiKey: config.DAYTONA_API_KEY,
		apiUrl: config.DAYTONA_API_URL,
		target: config.DAYTONA_TARGET,
		snapshot: SANDBOX_SNAPSHOT,
		user: "root",
		env: { GH_TOKEN: githubToken },
		autoStopInterval: SANDBOX_AUTO_STOP_MINUTES,
		autoDeleteInterval: SANDBOX_AUTO_DELETE_MINUTES,
		labels: { "bolt-thread": id.slice("bolt-".length) },
	});
	if (!supportsCommandExecution(sandbox)) throw new Error("Daytona sandbox does not support command execution.");
	return sandbox;
}

async function setupSandbox(sandbox: CommandDaytonaSandbox, threadKey: string): Promise<void> {
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

	const mountStatus = await sandbox.executeCommand("mountpoint", ["-q", FETCH_GCS_MOUNT_PATH]);
	if (mountStatus.exitCode === 0) return;

	const mount: MountResult = await sandbox.mount(createFetchFilesystem(), FETCH_GCS_MOUNT_PATH);
	if (!mount.success) throw new Error("Failed to mount the Fetch GCS bucket.", { cause: mount.error });
}

async function uploadWpilogAttachments(sandbox: CommandDaytonaSandbox, messages: Message[]): Promise<void> {
	const files: SandboxFileInput[] = [];
	for (const message of messages) {
		for (const [attachmentIndex, attachment] of message.attachments.entries()) {
			const filename = attachment.name;
			if (filename === undefined || !filename.toLowerCase().endsWith(".wpilog")) continue;
			if (attachment.fetchData === undefined) throw new Error(`Slack attachment ${filename} cannot be downloaded.`);

			const attachmentData = await attachment.fetchData();

			const messageId = sanitizeFilename(message.id);
			const safeName = sanitizeFilename(filename);
			files.push({
				path: `/workspace/uploads/${messageId}-${attachmentIndex}-${safeName}`,
				content: attachmentData instanceof ArrayBuffer ? Buffer.from(attachmentData) : attachmentData,
			});
		}
	}

	if (files.length === 0) return;
	const mkdir = await sandbox.executeCommand("mkdir", ["-p", "/workspace/uploads"]);
	if (mkdir.exitCode !== 0) throw new Error("Failed to create the sandbox upload directory.", { cause: mkdir });
	await sandbox.writeFiles(files);
}
