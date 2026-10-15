import { writeFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { GOOGLE_WORKSPACE_SERVERS } from "../src/google-workspace-servers.ts";

export async function getReadOnlyTools(url: string): Promise<string[]> {
	const client = new Client({ name: "bolt-google-workspace-tools", version: "1.0.0" });
	try {
		// Google's tool discovery is public; no service-account credentials are needed.
		await client.connect(new StreamableHTTPClientTransport(new URL(url)));
		const names = new Set<string>();
		let cursor: string | undefined;
		do {
			const result = await client.listTools({ cursor });
			for (const tool of result.tools) {
				if (tool.annotations?.readOnlyHint === true) names.add(tool.name);
			}
			cursor = result.nextCursor;
		} while (cursor !== undefined);
		// Junior treats an empty allowlist as unrestricted access.
		if (names.size === 0) throw new RangeError(`${url}: no read-only tools found`);
		return [...names].toSorted();
	} finally {
		await client.close();
	}
}

if (import.meta.main) {
	const entries = await Promise.all(
		GOOGLE_WORKSPACE_SERVERS.map(async ({ name, url }) => [name, await getReadOnlyTools(url)]),
	);
	await writeFile(
		new URL("../app/plugins/google-workspace-tools.json", import.meta.url),
		JSON.stringify(Object.fromEntries(entries), null, "\t") + "\n",
	);
	console.log(`Wrote read-only tools for ${entries.length} Google Workspace MCP servers.`);
}
