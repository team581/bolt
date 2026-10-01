import { defineJuniorPlugin } from "@sentry/junior-plugin-api";
import { JWT } from "google-auth-library";
import { config } from "../../src/config.ts";

const SCOPES = [
	"https://www.googleapis.com/auth/drive.readonly",
	"https://www.googleapis.com/auth/documents.readonly",
	"https://www.googleapis.com/auth/spreadsheets.readonly",
	"https://www.googleapis.com/auth/presentations.readonly",
];

const SERVERS = [
	{
		allowedTools: [
			"search_files",
			"list_recent_files",
			"get_file_metadata",
			"get_file_permissions",
			"read_file_content",
			"download_file_content",
		],
		description: "Read-only Google Drive search, metadata, and file content",
		displayName: "Google Drive",
		name: "google-drive",
		url: "https://drivemcp.googleapis.com/mcp/v1",
	},
	{
		allowedTools: ["read_doc"],
		description: "Read-only Google Docs content",
		displayName: "Google Docs",
		name: "google-docs",
		url: "https://docsmcp.googleapis.com/mcp/v1",
	},
	{
		allowedTools: ["get_values", "get_spreadsheet"],
		description: "Read-only Google Sheets values and spreadsheet content",
		displayName: "Google Sheets",
		name: "google-sheets",
		url: "https://sheetsmcp.googleapis.com/mcp/v1",
	},
	{
		allowedTools: ["read_presentation", "read_slide_page", "read_slide_page_thumbnail"],
		description: "Read-only Google Slides presentation content",
		displayName: "Google Slides",
		name: "google-slides",
		url: "https://slidesmcp.googleapis.com/mcp/v1",
	},
];

let client: JWT | undefined;

async function createGoogleWorkspaceAccessToken(): Promise<string> {
	const serviceAccount = config.GOOGLE_WORKSPACE_SERVICE_ACCOUNT_KEY;
	// google-auth-library caches the token and refreshes it before it expires.
	client ??= new JWT({
		email: String(Reflect.get(serviceAccount, "client_email")),
		key: String(Reflect.get(serviceAccount, "private_key")),
		scopes: SCOPES,
	});
	const { token } = await client.getAccessToken();
	if (token === null || token === undefined || token === "")
		throw new Error("Google Workspace service account returned no access token");
	return token;
}

export function googleWorkspacePlugins() {
	return SERVERS.map(({ allowedTools, url, ...manifest }) => {
		return defineJuniorPlugin({
			// `mcpAccessToken` comes from the @sentry/junior and @sentry/junior-plugin-api patches in patches/.
			hooks: { mcpAccessToken: createGoogleWorkspaceAccessToken },
			manifest: { ...manifest, mcp: { allowedTools, transport: "http", url } },
		});
	});
}
