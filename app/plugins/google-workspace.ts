import { defineJuniorPlugin } from "@sentry/junior-plugin-api";
import { JWT } from "google-auth-library";
import { config } from "../../src/config.ts";
import { GOOGLE_WORKSPACE_SERVERS } from "../../src/google-workspace-servers.ts";
import toolSnapshot from "./google-workspace-tools.json" with { type: "json" };

const SCOPES = [
	"https://www.googleapis.com/auth/drive.readonly",
	"https://www.googleapis.com/auth/documents.readonly",
	"https://www.googleapis.com/auth/spreadsheets.readonly",
	"https://www.googleapis.com/auth/presentations.readonly",
];

const toolsByServer: Record<string, string[]> = toolSnapshot;

let client: JWT | undefined;

async function createGoogleWorkspaceAccessToken(): Promise<string> {
	const serviceAccount = config.GOOGLE_SERVICE_ACCOUNT_KEY;
	// google-auth-library caches the token and refreshes it before it expires.
	client ??= new JWT({
		email: String(Reflect.get(serviceAccount, "client_email")),
		key: String(Reflect.get(serviceAccount, "private_key")),
		scopes: SCOPES,
	});
	const { token } = await client.getAccessToken();
	if (typeof token !== "string" || token === "")
		throw new Error("Google Workspace service account returned no access token");
	return token;
}

export function googleWorkspacePlugins() {
	return GOOGLE_WORKSPACE_SERVERS.map(({ url, ...manifest }) => {
		const allowedTools = toolsByServer[manifest.name];
		if (allowedTools === undefined || allowedTools.length === 0) {
			throw new Error(`Missing read-only Google Workspace tools for ${manifest.name}`);
		}
		return defineJuniorPlugin({
			// `mcpAccessToken` comes from the @sentry/junior and @sentry/junior-plugin-api patches in patches/.
			hooks: { mcpAccessToken: createGoogleWorkspaceAccessToken },
			manifest: { ...manifest, mcp: { allowedTools, transport: "http", url } },
		});
	});
}
