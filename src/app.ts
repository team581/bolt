import "./sentry.ts";
import { createChannelRouter } from "@flue/runtime";
import { createAgentRouter } from "@flue/runtime/routing";
import { Hono } from "hono";
import { Bolt } from "./agents/bolt.ts";
import { channel as slack } from "./channels/slack.ts";

const app = new Hono();
app.route("/agents/assistant", createAgentRouter(Bolt));
app.route("/channels/slack", createChannelRouter(slack.routes));

export default app;
