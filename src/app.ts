import { createAgentRouter } from "@flue/runtime/routing";
import type { LoadedFlueNodeApplication } from "@flue/vite";
import { sentry } from "@sentry/hono/node";
import { Hono } from "hono";
import { Bolt } from "./agents/bolt.ts";
import { createSlackChannel } from "./channels/slack.ts";
import "./sentry.ts";

const app = new Hono();
app.use(sentry(app));
const slack = createSlackChannel();
app.get("/health", (context) => context.json({ status: "ok" }));
app.route("/agents/assistant", createAgentRouter(Bolt));
app.post("/channels/slack/events", (context) => slack.handleWebhook(context.req.raw));

export default {
	fetch: app.fetch.bind(app),
	// @ts-expect-error: This is from our patch
	start: () => slack.start(),
	stop: () => slack.stop(),
} satisfies LoadedFlueNodeApplication;
