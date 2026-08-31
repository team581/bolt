import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const distPath = resolve(".mastra/output/node_modules/@mastra/core/dist");
const original = "if (isRunning) pruneRunningHistory(context, activeStepIds);";
const patched = "if (isRunning && activeStepIds.size > 0) pruneRunningHistory(context, activeStepIds);";
let patchedFiles = 0;

for (const file of await readdir(distPath)) {
	if (!/^agent-.*\.(?:cjs|js)$/u.test(file)) continue;

	const path = join(distPath, file);
	const source = await readFile(path, "utf8");
	if (!source.includes("function pruneAgentLoopSnapshot")) continue;

	const occurrences = source.split(original).length - 1;
	if (occurrences === 1) {
		await writeFile(path, source.replace(original, patched));
	} else if (!source.includes(patched)) {
		throw new Error(`Could not apply the durable recovery patch to ${file}`);
	}

	patchedFiles++;
}

if (patchedFiles === 0) {
	throw new Error("Could not find Mastra's durable recovery implementation in the build output");
}

console.log(`Patched durable recovery in ${patchedFiles} built @mastra/core files`);
