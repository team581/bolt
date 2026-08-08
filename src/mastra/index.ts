import { Mastra } from "@mastra/core";
import { registerApiRoute } from "@mastra/core/server";
import { MastraPlatformExporter, MastraStorageExporter, Observability } from "@mastra/observability";
import { SentryExporter } from "@mastra/sentry";
import { config } from "../config.ts";
import { storage } from "./storage.ts";

export const mastra = new Mastra({
	storage,
	observability: new Observability({
		configs: {
			sentry: {
				serviceName: "bolt",
				exporters: [
					new SentryExporter({
						dsn: config.SENTRY_DSN,
						environment: process.env.NODE_ENV,
						tracesSampleRate: 1,
					}),
				],
				requestContextKeys: ["bolt.slackThreadId"],
			},
			default: {
				serviceName: "mastra",
				exporters: [new MastraStorageExporter(), new MastraPlatformExporter()],
			},
		},
	}),
	server: {
		apiRoutes: [
			registerApiRoute("/health", {
				method: "GET",
				requiresAuth: false,
				handler: () => Response.json({ ok: true }),
			}),
		],
	},
});
