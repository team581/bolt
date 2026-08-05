import "./sentry.ts";
import { createAgentRouter } from "@flue/runtime/routing";
import { Hono } from "hono";
import { Bolt } from "./agents/bolt.ts";
import { handleSlackWebhook, initializeSlack } from "./channels/slack.ts";

await initializeSlack();

const app = new Hono();
app.get("/health", (context) => context.json({ status: "ok" }));
app.route("/agents/assistant", createAgentRouter(Bolt));
app.post("/channels/slack/events", (context) => handleSlackWebhook(context.req.raw));

export default app;
