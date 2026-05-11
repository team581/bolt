import { readFile, writeFile } from "node:fs/promises";
import Handlebars from "handlebars";
import { manageGithubProjects } from "./prompts/manage-github-projects.ts";

export interface PromptGenerator {
	name: string;
	templatePath: string;
	outputPath: string;
	getData(): Promise<unknown>;
}

const generators: PromptGenerator[] = [manageGithubProjects];

async function render(generator: PromptGenerator): Promise<void> {
	const [templateSource, data] = await Promise.all([readFile(generator.templatePath, "utf8"), generator.getData()]);
	const template = Handlebars.compile(templateSource, { noEscape: true });
	const rendered = template(data);
	await writeFile(generator.outputPath, rendered);
	console.log(`[${generator.name}] Wrote ${generator.outputPath}`);
}

await Promise.all(generators.map(render));
