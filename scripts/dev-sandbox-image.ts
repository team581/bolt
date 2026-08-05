import { x } from "tinyexec";

const SANDBOX_IMAGE = "ghcr.io/team581/bolt-sandbox";

export async function resolveDevSandboxImage(): Promise<string> {
	const { stdout } = await x("gh", [
		"run",
		"list",
		"--repo",
		"team581/bolt",
		"--workflow",
		"publish-sandbox.yml",
		"--branch",
		"main",
		"--status",
		"success",
		"--limit",
		"1",
		"--json",
		"headSha",
	]);
	const [run] = JSON.parse(stdout) as { headSha?: string }[];
	if (!run?.headSha) throw new Error("No successful sandbox image workflow run was found.");
	return `${SANDBOX_IMAGE}:${run.headSha}`;
}
