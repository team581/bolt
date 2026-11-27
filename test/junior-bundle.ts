import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const dist = dirname(require.resolve("@sentry/junior"));

export function juniorBundle(prefix: string): { path: string; source: string } {
	const matches = readdirSync(dist).filter((name) => name.startsWith(prefix) && name.endsWith(".js"));
	if (matches.length !== 1) throw new Error(`Expected one Junior bundle matching ${prefix}, got ${matches.length}`);
	const path = join(dist, matches[0]!);
	return { path, source: readFileSync(path, "utf8") };
}

// These internals are not public exports. Fail visibly if an upstream bundle moves them.
export function bundledSection(source: string, start: string, end: string): string {
	const from = source.indexOf(start);
	const to = source.indexOf(end, from + start.length);
	if (from < 0 || to < 0) throw new Error(`Junior bundle no longer contains ${start}`);
	return source.slice(from, to);
}
