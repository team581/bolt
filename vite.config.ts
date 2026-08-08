import { defineConfig } from "vite-plus";

export default defineConfig({
	staged: {
		"*": "vp check --fix",
	},
	fmt: {
		useTabs: true,
		printWidth: 120,
		ignorePatterns: ["**/*.hbs", "src/mastra/agents/bolt/skills/analyze-wpilog/SKILL.md"],
	},
	lint: {
		categories: {
			correctness: "error",
			pedantic: "error",
			perf: "error",
			suspicious: "error",
		},
		options: { typeAware: true, typeCheck: true },
		overrides: [
			{
				files: ["**/*.test.ts", "scripts/**/*.ts"],
				rules: { "typescript/no-unsafe-type-assertion": "off" },
			},
		],
		rules: {
			"max-lines-per-function": "off",
			"no-await-in-loop": "off",
			"oxc/no-map-spread": "off",
			"typescript/prefer-readonly-parameter-types": "off",
		},
	},
	test: {
		env: {
			AI_GATEWAY_API_KEY: "test-ai-gateway-key",
			DATABASE_URL: "postgresql://localhost:5432/bolt_test",
			DAYTONA_API_KEY: "test-daytona-api-key",
			GITHUB_APP_ID: "test-github-app-id",
			GITHUB_APP_PRIVATE_KEY: "test-github-private-key",
			GITHUB_INSTALLATION_ID: "12345",
			NODE_ENV: "test",
			SLACK_BOT_TOKEN: "xoxb-test",
			SLACK_SIGNING_SECRET: "test-slack-signing-secret",
		},
		passWithNoTests: true,
	},
});
