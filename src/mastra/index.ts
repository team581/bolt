import { Mastra } from "@mastra/core";
import { registerApiRoute, SimpleAuth } from "@mastra/core/server";
import { MastraPlatformExporter, MastraStorageExporter, Observability } from "@mastra/observability";
import { SentryExporter } from "@mastra/sentry";
import { config } from "../config.ts";
import { replyGateAgent } from "./agents/bolt/reply-gate.ts";
import { storage } from "./storage.ts";

export const mastra = new Mastra({
	agents: { replyGateAgent },
	storage,
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
					new MastraStorageExporter(),
					new MastraPlatformExporter(),
				],
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
