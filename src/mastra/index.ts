import { Mastra } from "@mastra/core";
import { registerApiRoute, SimpleAuth } from "@mastra/core/server";
import { MastraPlatformExporter, Observability } from "@mastra/observability";
import { SentryExporter } from "@mastra/sentry";
import { config, isDevelopment } from "../config.ts";
import { replyGateAgent } from "./agents/bolt/reply-gate.ts";
import { requestContextFilter } from "./request-context-filter.ts";
import { storage } from "./storage.ts";

const DURABLE_RECOVERY_DELAY_MS = 20_000;
let durableRecoveryStarted = false;

export const mastra = new Mastra({
	agents: { replyGateAgent },
	bundler: {
		// Bundle @mastra/daytona so its pnpm patch is preserved in the deployment artifact.
		externals: [
			"@chat-adapter/slack",
			"@daytonaio/sdk",
			"@mastra/core",
			"@mastra/gcs",
			"@mastra/memory",
			"@mastra/observability",
			"@mastra/pg",
			"@mastra/sentry",
			"@octokit/auth-app",
			"@octokit/request",
			"@sentry/node",
			"ai",
			"chat",
			"chrono-node",
			"croner",
			"envalid",
			"hono",
			"mastra",
			"tslib",
			"zod",
		],
	},
	storage,
	scheduler: { enabled: true },
	recovery: { durableAgents: isDevelopment ? "auto" : "off" },
	observability: new Observability({
		configs: {
			default: {
				serviceName: "bolt",
				exporters: [
					new SentryExporter({
						dsn: config.SENTRY_DSN,
						environment: process.env.NODE_ENV,
						tracesSampleRate: 1,
					}),
					new MastraPlatformExporter(),
				],
				spanOutputProcessors: [requestContextFilter],
				requestContextKeys: ["bolt.slackThreadId"],
			},
		},
	}),
	server: {
		auth: new SimpleAuth({
			tokens: {
				[config.MASTRA_API_KEY]: { id: "bolt-api" },
			},
		}),
		apiRoutes: [
			registerApiRoute("/health", {
				method: "GET",
				requiresAuth: false,
				handler: () => {
					startDurableRecovery();
					return Response.json({ ok: true });
				},
			}),
		],
	},
});

function startDurableRecovery(): void {
	if (isDevelopment || durableRecoveryStarted) return;
	durableRecoveryStarted = true;
	// Railway healthchecks complete before it terminates the old deployment. Wait
	// past its 15-second drain window so both containers cannot recover one run.
	setTimeout(() => {
		mastra.restartAllActiveWorkflowRuns().catch((error: unknown) => {
			mastra.getLogger().error("Failed to restart active workflow runs after startup", { error });
		});
		mastra
			.recoverAllDurableAgents()
			.then((result) => {
				mastra.getLogger().info("Recovered durable agent runs after startup", result);
			})
			.catch((error: unknown) => {
				mastra.getLogger().error("Failed to recover durable agent runs after startup", { error });
			});
	}, DURABLE_RECOVERY_DELAY_MS);
}
