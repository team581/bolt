import { defineConfig } from "vite-plus";
import { flue } from "@flue/vite";
import packageJson from "./package.json" with { type: "json" };
import { resolveDevSandboxImage } from "./scripts/dev-sandbox-image.ts";

const bundledPackages = new Set(["@flue/runtime", "debug"]);
const externalPackages = [...Object.keys(packageJson.dependencies), ...Object.keys(packageJson.devDependencies)]
	.filter((packageName) => !bundledPackages.has(packageName))
	.map((packageName) => new RegExp(`^${packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:/|$)`));

export default defineConfig(async ({ command }) => {
	if (command === "serve" && !process.env.VITEST && !process.env.BOLT_SANDBOX_IMAGE) {
		process.env.BOLT_SANDBOX_IMAGE = await resolveDevSandboxImage();
		console.log(`[bolt] Using sandbox image ${process.env.BOLT_SANDBOX_IMAGE}`);
	}

	return {
		staged: {
			"*": "vp check --fix",
		},
		fmt: {
			useTabs: true,
			printWidth: 120,
			ignorePatterns: ["**/*.hbs", "src/agents/bolt/skills/analyze-wpilog/SKILL.md"],
		},
		lint: { options: { typeAware: true, typeCheck: true } },
		build: {
			rolldownOptions: {
				external: externalPackages,
			},
		},
		server: {
			allowedHosts: true as const,
		},
		plugins: process.env.VITEST ? [] : [flue({ providers: ["vercel-ai-gateway"] })],
		test: {
			env: { NODE_ENV: "test" },
			passWithNoTests: true,
		},
	};
});
