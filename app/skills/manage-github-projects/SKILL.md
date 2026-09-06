---
name: manage-github-projects
description: Use when working with Team 581 GitHub Projects and issues. Covers issue types, priorities, deadlines, milestones, project status, board items, sub-issues, and dependencies.
license: MIT
---

# Manage GitHub Projects

Drive Team 581's GitHub Projects (v2) boards through the `gh` CLI. Each Bash command receives a fresh Team 581 GitHub App installation token.

The skill's resources include one reference file per open Team 581 project, named from the project title (for example, `references/fetch-2026.md`).

- Read `references/organization.md` when the work involves issue types or organization-level issue fields.
- For project operations, select the resource whose filename or heading matches the user's request and read it before running commands.
- Never assume the newest project is the main project. A repository also does not imply a project.
- If more than one project could match a write operation, ask the user which project they mean.

## Team 581 conventions

- The org is always `team581`. Pass `--owner team581` on every `gh project` command.
- Projects belong to the org, not a repo. The repo on an issue or PR is independent of which project it is on.

## Issue types

When creating or editing issues, assign a type if it is obvious which one to use. Leave it blank otherwise. Use a type name from `references/organization.md` with `gh issue create --type <name>` or `gh issue edit --type <name>`. Use `--remove-type` to clear it.

## Issue fields

Prefer organization-level issue fields over project fields when possible. Set an issue field value with its field ID from `references/organization.md`:

```sh
gh api --method POST \
  --header "X-GitHub-Api-Version: 2026-03-10" \
  /repos/<owner>/<repo>/issues/<issue-number>/issue-field-values \
  --input - <<'JSON'
{"issue_field_values":[{"field_id":<field-id>,"value":"<value>"}]}
JSON
```

For single-select issue fields, use the option name as the value. Clear a field with:

```sh
gh api --method DELETE \
  --header "X-GitHub-Api-Version: 2026-03-10" \
  /repos/<owner>/<repo>/issues/<issue-number>/issue-field-values/<field-id>
```

## Project fields

Use project fields for project-only metadata. Item IDs are per-item and must be looked up:

```sh
gh project item-list <project-number> --owner team581 --format json --limit 200
```

Edit a field on an item with one value flag per call, matching the field type: `--text`, `--number`, `--date YYYY-MM-DD`, `--iteration-id`, `--single-select-option-id`, or `--clear`.

```sh
gh project item-edit \
  --id <item-id> \
  --project-id <project-id> \
  --field-id <field-id> \
  --single-select-option-id <option-id>
```

If the user names a value for a single-select field that is not in the selected project reference, ask rather than picking the closest match.

## Issue relationships

Manage issue hierarchy with `gh issue edit`:

- `--parent <issue>` sets or changes a parent.
- `--remove-parent` removes a parent.
- `--add-sub-issue <issue>` adds a child issue.
- `--remove-sub-issue <issue>` removes a child issue.

Manage issue dependencies with `gh issue create --blocked-by <issue> --blocking <issue>` or `gh issue edit`:

- `--add-blocked-by <issue>`
- `--remove-blocked-by <issue>`
- `--add-blocking <issue>`
- `--remove-blocking <issue>`

Read issue structure and dependency data:

```sh
gh issue view <issue-number-or-url> \
  --repo <owner>/<repo> \
  --json issueType,parent,subIssues,subIssuesSummary,blockedBy,blocking
```
