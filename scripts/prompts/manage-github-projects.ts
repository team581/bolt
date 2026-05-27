import { join } from "node:path";
import { x } from "tinyexec";
import type { PromptGenerator } from "../generate-prompts.ts";

const OWNER = "team581";

const SKILL_DIR = join(
	import.meta.dirname,
	"..",
	"..",
	"app",
	"plugins",
	"manage-github-projects",
	"skills",
	"manage-github-projects",
);

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

type ExampleSelection = {
	fieldId: string;
	optionId: string;
};

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

type IssueFieldExample = {
	issue_field_values: [
		{
			field_id: number;
			value: number | string;
		},
	];
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
	project: ProjectListEntry;
	fields: ProjectField[];
	issueFieldExample: IssueFieldExample | null;
	issueFields: IssueField[];
	issueTypes: IssueType[];
	issueSingleSelectFields: IssueSingleSelectField[];
	singleSelectFields: SingleSelectField[];
	example: ExampleSelection | null;
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

	const [project] = projects.filter((p) => !p.closed).sort((a, b) => b.number - a.number);
	if (!project) throw new Error(`No open projects found for ${OWNER}`);

	const { fields: allFields } = await gh<{ fields: ProjectField[] }>([
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

	const issueTypes = await gh<RestIssueType[]>([
		"api",
		"--header",
		"X-GitHub-Api-Version: 2026-03-10",
		`/orgs/${OWNER}/issue-types`,
	]);

	const rawIssueFields = await gh<IssueField[]>([
		"api",
		"--header",
		"X-GitHub-Api-Version: 2026-03-10",
		`/orgs/${OWNER}/issue-fields`,
	]);

	const issueFields = rawIssueFields.map((field) => ({
		...field,
		options: field.options?.toSorted((a, b) => (a.priority ?? 0) - (b.priority ?? 0)),
	}));

	const issueFieldNames = new Set(issueFields.map((field) => field.name));
	const fields = allFields.filter((f) => !BUILTIN_FIELD_NAMES.has(f.name) && !issueFieldNames.has(f.name));

	const singleSelectFields = fields.filter((f) => f.type === "ProjectV2SingleSelectField");
	const issueSingleSelectFields = issueFields.filter(
		(field): field is IssueSingleSelectField => field.data_type === "single_select",
	);

	const [exampleField] = singleSelectFields;
	const exampleOption = exampleField?.options[0];
	const [issueFieldExampleField] = issueFields;

	return {
		project,
		fields,
		issueFieldExample: issueFieldExampleField
			? {
					issue_field_values: [
						{
							field_id: issueFieldExampleField.id,
							value:
								issueFieldExampleField.data_type === "single_select"
									? (issueFieldExampleField.options?.[0]?.name ?? "<option-name>")
									: issueFieldExampleField.data_type === "date"
										? "YYYY-MM-DD"
										: issueFieldExampleField.data_type === "number"
											? 1
											: "<value>",
						},
					],
				}
			: null,
		issueFields,
		issueTypes: issueTypes
			.filter((issueType) => issueType.is_enabled)
			.map((issueType) => ({
				description: issueType.description,
				id: issueType.node_id,
				name: issueType.name,
			})),
		issueSingleSelectFields,
		singleSelectFields,
		example: exampleOption ? { fieldId: exampleField!.id, optionId: exampleOption.id } : null,
	};
}

export const manageGithubProjects: PromptGenerator = {
	name: "manage-github-projects",
	templatePath: join(SKILL_DIR, "SKILL.md.hbs"),
	outputPath: join(SKILL_DIR, "SKILL.md"),
	getData,
};
