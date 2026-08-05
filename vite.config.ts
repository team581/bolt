import { defineConfig } from "vite-plus";
import { flue } from "@flue/vite";
import packageJson from "./package.json" with { type: "json" };

const bundledPackages = new Set(["@flue/runtime", "debug"]);
const externalPackages = [...Object.keys(packageJson.dependencies), ...Object.keys(packageJson.devDependencies)]
	.filter((packageName) => !bundledPackages.has(packageName))
	.map((packageName) => new RegExp(`^${packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:/|$)`));

export default defineConfig({
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
		allowedHosts: true,
	},
	plugins: process.env.VITEST ? [] : [flue({ providers: ["vercel-ai-gateway"] })],
	test: {
		env: { NODE_ENV: "test" },
		passWithNoTests: true,
	},
});
