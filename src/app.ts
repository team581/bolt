import { createAgentRouter } from "@flue/runtime/routing";
import { Hono } from "hono";
import { Assistant } from "./agents/assistant.ts";

// 1. Create your Hono application instance.
const app = new Hono();
// 2. Define your agent routes.
app.route("/agents/assistant", createAgentRouter(Assistant));
// 3. Export your application.
export default app;
