import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import slugify from "@sindresorhus/slugify";
import Handlebars from "handlebars";
import { x } from "tinyexec";

const OWNER = "team581";
const REFERENCES_DIR = join(
	import.meta.dirname,
	"..",
	"src",
	"mastra",
	"agents",
	"bolt",
	"skills",
	"manage-github-projects",
	"references",
);
const ORGANIZATION_TEMPLATE = join(import.meta.dirname, "prompts", "manage-github-projects.organization.md.hbs");
const PROJECT_TEMPLATE = join(import.meta.dirname, "prompts", "manage-github-projects.project.md.hbs");

// Names of built-in fields that ship with every GitHub project.
// Anything outside this set was added by us and is worth documenting.
const BUILTIN_FIELD_NAMES = new Set([
	"Assignees",
	"Closed",
	"Created",
	"Labels",
	"Linked pull requests",
	"Milestone",
	"Parent issue",
	"Repository",
	"Reviewers",
	"Sub-issues progress",
	"Title",
	"Updated",
]);

type ProjectListEntry = {
	closed: boolean;
	id: string;
	number: number;
	title: string;
	url: string;
};

type FieldOption = {
	id: string;
	name: string;
};

type SingleSelectField = {
	id: string;
	name: string;
	options: FieldOption[];
	type: "ProjectV2SingleSelectField";
};

type SimpleField = {
	id: string;
	name: string;
	type: "ProjectV2Field";
};

type IterationField = {
	id: string;
	name: string;
	type: "ProjectV2IterationField";
};

type ProjectField = SingleSelectField | SimpleField | IterationField;

type IssueFieldOption = {
	color: string | null;
	description: string | null;
	id: number;
	name: string;
	priority: number | null;
};

type IssueField = {
	data_type: "date" | "number" | "single_select" | "text";
	description: string | null;
	id: number;
	name: string;
	node_id: string;
	options?: IssueFieldOption[];
};

type IssueSingleSelectField = IssueField & {
	data_type: "single_select";
	options: IssueFieldOption[];
};

type IssueType = {
	description: string;
	id: string;
	name: string;
};

type RestIssueType = {
	description: string;
	is_enabled: boolean;
	name: string;
	node_id: string;
};

type ManageGithubProjectsData = {
	issueFields: IssueField[];
	issueTypes: IssueType[];
	issueSingleSelectFields: IssueSingleSelectField[];
	projects: Array<{
		project: ProjectListEntry;
		fields: ProjectField[];
		singleSelectFields: SingleSelectField[];
	}>;
};

async function gh<T>(args: string[]): Promise<T> {
	const { stdout } = await x("gh", args, { throwOnError: true });
	return JSON.parse(stdout) as T;
}

async function getData(): Promise<ManageGithubProjectsData> {
	const { projects } = await gh<{ projects: ProjectListEntry[] }>([
		"project",
		"list",
		"--owner",
		OWNER,
		"--format",
		"json",
		"--limit",
		"100",
	]);

	const openProjects = projects.filter((project) => !project.closed).toSorted((a, b) => b.number - a.number);
	if (openProjects.length === 0) throw new Error(`No open projects found for ${OWNER}`);

	const [issueTypes, rawIssueFields, projectFields] = await Promise.all([
		gh<RestIssueType[]>(["api", "--header", "X-GitHub-Api-Version: 2026-03-10", `/orgs/${OWNER}/issue-types`]),
		gh<IssueField[]>(["api", "--header", "X-GitHub-Api-Version: 2026-03-10", `/orgs/${OWNER}/issue-fields`]),
		Promise.all(
			openProjects.map(async (project) => {
				const { fields } = await gh<{ fields: ProjectField[] }>([
					"project",
					"field-list",
					String(project.number),
					"--owner",
					OWNER,
					"--format",
					"json",
					"--limit",
					"100",
				]);
				return { project, fields };
			}),
		),
	]);

	const issueFields = rawIssueFields.map((field) => ({
		...field,
		options: field.options?.toSorted((a, b) => (a.priority ?? 0) - (b.priority ?? 0)),
	}));
	const issueFieldNames = new Set(issueFields.map((field) => field.name));

	return {
		issueFields,
		issueTypes: issueTypes
			.filter((issueType) => issueType.is_enabled)
			.map((issueType) => ({
				description: issueType.description,
				id: issueType.node_id,
				name: issueType.name,
			})),
		issueSingleSelectFields: issueFields.filter(
			(field): field is IssueSingleSelectField => field.data_type === "single_select",
		),
		projects: projectFields.map(({ project, fields: allFields }) => {
			const fields = allFields.filter(
				(field) => !BUILTIN_FIELD_NAMES.has(field.name) && !issueFieldNames.has(field.name),
			);
			return {
				project,
				fields,
				singleSelectFields: fields.filter((field) => field.type === "ProjectV2SingleSelectField"),
			};
		}),
	};
}

const [data, organizationTemplateSource, projectTemplateSource] = await Promise.all([
	getData(),
	readFile(ORGANIZATION_TEMPLATE, "utf8"),
	readFile(PROJECT_TEMPLATE, "utf8"),
]);
const renderOrganization = Handlebars.compile(organizationTemplateSource, { noEscape: true });
const renderProject = Handlebars.compile(projectTemplateSource, { noEscape: true });

await mkdir(REFERENCES_DIR, { recursive: true });
const projectFiles = data.projects.map(({ project }) => slugify(project.title) + ".md");
if (new Set(projectFiles).size !== projectFiles.length) {
	throw new Error("Open GitHub project titles produced duplicate reference filenames.");
}

await Promise.all([
	writeFile(join(REFERENCES_DIR, "organization.md"), renderOrganization(data)),
	...data.projects.map((project, index) =>
		writeFile(join(REFERENCES_DIR, projectFiles[index]!), renderProject(project)),
	),
]);

const expectedFiles = new Set(["organization.md", ...projectFiles]);
const existingFiles = await readdir(REFERENCES_DIR, { withFileTypes: true });
await Promise.all(
	existingFiles
		.filter((entry) => entry.isFile() && entry.name.endsWith(".md") && !expectedFiles.has(entry.name))
		.map((entry) => unlink(join(REFERENCES_DIR, entry.name))),
);

console.log(`Wrote references for ${data.projects.length} open GitHub projects.`);
