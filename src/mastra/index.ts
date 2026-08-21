import { Mastra } from "@mastra/core";
import { registerApiRoute, SimpleAuth } from "@mastra/core/server";
import { MastraPlatformExporter, Observability } from "@mastra/observability";
import { SentryExporter } from "@mastra/sentry";
import { config } from "../config.ts";
import { replyGateAgent } from "./agents/bolt/reply-gate.ts";
import { requestContextFilter } from "./request-context-filter.ts";
import { storage } from "./storage.ts";

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
	recovery: { durableAgents: "auto" },
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
				handler: () => Response.json({ ok: true }),
			}),
		],
	},
});
