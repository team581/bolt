import { defineConfig } from "vite-plus";
import { flue } from "@flue/vite";

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
	server: {
		allowedHosts: true,
	},
	plugins: process.env.VITEST ? [] : [flue({ providers: ["vercel-ai-gateway"] })],
	test: {
		passWithNoTests: true,
	},
});
