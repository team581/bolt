import { defineConfig } from "@flue/runtime/config";

export default defineConfig({
	// Use "cloudflare" when deploying to Workers.
	target: "node",
});
