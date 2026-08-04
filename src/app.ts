import { createAgentRouter } from "@flue/runtime/routing";
import { Hono } from "hono";
import { Bolt } from "./agents/bolt.ts";

// 1. Create your Hono application instance.
const app = new Hono();
// 2. Define your agent routes.
app.route("/agents/assistant", createAgentRouter(Bolt));
// 3. Export your application.
export default app;
