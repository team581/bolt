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
		env: { NODE_ENV: "test" },
		passWithNoTests: true,
	},
});
