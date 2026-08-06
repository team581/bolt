import { defineConfig } from "vite-plus";
import { flue } from "@flue/vite";
import packageJson from "./package.json" with { type: "json" };
import { resolveDevSandboxImage } from "./scripts/dev-sandbox-image.ts";

const bundledPackages = new Set(["@flue/runtime", "debug"]);
const externalPackages = [...Object.keys(packageJson.dependencies), ...Object.keys(packageJson.devDependencies)]
	.filter((packageName) => !bundledPackages.has(packageName))
	.map((packageName) => new RegExp(`^${packageName.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&")}(?:/|$)`, "u"));
const isUnset = (value: string | undefined): value is undefined | "" => value === undefined || value.length === 0;

export default defineConfig(async ({ command }) => {
	if (command === "serve" && isUnset(process.env.VITEST) && isUnset(process.env.BOLT_SANDBOX_IMAGE)) {
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
		lint: {
			categories: {
				correctness: "error",
				pedantic: "error",
				perf: "error",
				suspicious: "error",
			} as const,
			options: { typeAware: true, typeCheck: true },
			overrides: [
				{
					files: ["**/*.test.ts"],
					rules: { "typescript/no-unsafe-type-assertion": "off" } as const,
				},
				{
					files: ["scripts/**/*.ts"],
					rules: { "typescript/no-unsafe-type-assertion": "off" } as const,
				},
			],
			rules: {
				"max-lines-per-function": "off",
				"no-await-in-loop": "off",
				"oxc/no-map-spread": "off",
				"typescript/prefer-readonly-parameter-types": "off",
			} as const,
		},
		build: {
			rolldownOptions: {
				external: externalPackages,
			},
		},
		server: {
			allowedHosts: true as const,
		},
		plugins: isUnset(process.env.VITEST) ? [flue({ providers: ["vercel-ai-gateway"] })] : [],
		test: {
			env: { NODE_ENV: "test" },
			passWithNoTests: true,
		},
	};
});
