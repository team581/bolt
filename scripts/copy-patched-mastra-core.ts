import { cp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const source = resolve("node_modules/@mastra/core");
const destination = resolve(".mastra/output/node_modules/@mastra/core");
const patchMarker = "if (isRunning && activeStepIds.size > 0) pruneRunningHistory";

async function hasPatch(packagePath: string): Promise<boolean> {
	const distPath = join(packagePath, "dist");
	const files = await readdir(distPath);
	for (const file of files) {
		if (!/^agent-.*\.(?:cjs|js)$/u.test(file)) continue;
		if ((await readFile(join(distPath, file), "utf8")).includes(patchMarker)) return true;
	}
	return false;
}

if (!(await hasPatch(source))) {
	throw new Error("The installed @mastra/core package is missing the durable recovery patch");
}

await rm(destination, { force: true, recursive: true });
await mkdir(dirname(destination), { recursive: true });
await cp(source, destination, { dereference: true, recursive: true });

if (!(await hasPatch(destination))) {
	throw new Error("The built @mastra/core package is missing the durable recovery patch");
}

console.log("Copied patched @mastra/core into the deployment artifact");
