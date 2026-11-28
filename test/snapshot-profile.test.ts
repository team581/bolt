import { pathToFileURL } from "node:url";
import { expect, it, vi } from "vitest";
import { juniorBundle } from "./junior-bundle.ts";

it("retains the complete profile of Bolt's current production sandbox snapshot", async () => {
	vi.stubEnv("VERCEL_SANDBOX_WORKSPACE_DIR", "/workspace");
	try {
		await import("../server.ts");
		const bundle = juniorBundle("projection-");
		const exports = bundle.source.slice(bundle.source.lastIndexOf("export {"));
		const createName = /\bcreate as (\w+)/u.exec(exports)?.[1];
		const runtimeName = /\bSANDBOX_RUNTIME as (\w+)/u.exec(exports)?.[1];
		if (createName === undefined || runtimeName === undefined) throw new Error("Junior's snapshot profile API moved");
		const module = (await import(pathToFileURL(bundle.path).href)) as Record<string, unknown>;
		expect(module[runtimeName]).toBe("node22");
		const create = module[createName] as (runtime: string) => { hash: string };
		// The production release logged this full dependency/postinstall profile on 2026-11-27.
		expect(create("node22").hash).toBe("6952c4ef08a1a21b64798d3fa8a801de648f091a9441f90da6aa3ee7bd8856d8");
	} finally {
		vi.unstubAllEnvs();
	}
});
