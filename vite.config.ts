import { defineConfig } from "vite-plus";

export default defineConfig({
	staged: {
		"*": "vp check --fix",
	},
	fmt: {
		useTabs: true,
		printWidth: 120,
		ignorePatterns: ["**/*.hbs", "app/skills/analyze-wpilog/SKILL.md", ".agents/skills/**/*", "skills-lock.json"],
	},
	lint: {
		categories: {
			correctness: "error",
			pedantic: "error",
			perf: "error",
			suspicious: "error",
		},
		ignorePatterns: [".agents/skills/**/*", "skills-lock.json"],
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
			GITHUB_APP_ID: "test-github-app-id",
			GITHUB_APP_PRIVATE_KEY: "test-github-private-key",
			GITHUB_INSTALLATION_ID: "12345",
			GCS_SERVICE_ACCOUNT_KEY:
				'{"client_email":"bolt@example.iam.gserviceaccount.com","private_key":"test-private-key","project_id":"test-gcs-project","token_uri":"https://oauth2.googleapis.com/token"}',
			NODE_ENV: "test",
		},
		include: ["test/**/*.test.ts"],
		passWithNoTests: true,
	},
});
