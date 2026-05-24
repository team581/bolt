import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { defineConfig } from "nitro";
import { parse } from "yaml";
import { z } from "zod";
import { juniorNitro } from "@sentry/junior/nitro";

const require = createRequire(import.meta.url);
const GITHUB_PLUGIN_PACKAGE = "@sentry/junior-github";
const EXTRA_GITHUB_CAPABILITIES = [
	"organization-projects.read",
	"organization-projects.write",
	"repository-projects.read",
	"repository-projects.write",
];

const GitHubPluginManifest = z.object({
	capabilities: z.array(z.string().min(1)).nonempty(),
});

async function readGithubPluginCapabilities(): Promise<string[]> {
	const pluginManifestPath = require.resolve(`${GITHUB_PLUGIN_PACKAGE}/plugin.yaml`);
	const pluginManifest = await readFile(pluginManifestPath, "utf8");
	const manifest = GitHubPluginManifest.parse(parse(pluginManifest));

	return manifest.capabilities;
}

const githubCapabilities = Iterator.from(
	new Set([...(await readGithubPluginCapabilities()), ...EXTRA_GITHUB_CAPABILITIES]).values(),
).toArray();

export default defineConfig({
	preset: "node-server",
	sourcemap: true,
	modules: [
		juniorNitro({
			plugins: {
				packages: [GITHUB_PLUGIN_PACKAGE],
				manifests: {
					github: {
						capabilities: githubCapabilities,
					},
				},
			},
		}),
	],
	routes: {
		"/**": { handler: "./server.ts" },
	},
});
