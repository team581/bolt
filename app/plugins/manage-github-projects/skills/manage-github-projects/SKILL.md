---
name: manage-github-projects
description: Use when working with Team 581 GitHub Projects and issues. Complements github-issues with workflows for creating or updating Team 581 issues, issue types, priorities, deadlines, milestones, project status, and board items.
license: MIT
---

# Manage GitHub Projects

Drive Team 581's GitHub Projects (v2) boards through the `gh project` CLI.

For issue creation, updates, comments, or triage, also load the `github-issues` skill and apply its issue-writing and GitHub CLI conventions. This skill remains the source of truth for Team 581-specific org/project metadata: issue types, issue fields, sub-issues, and GitHub Projects fields.

## Team 581 conventions

- The org is always `team581`. Pass `--owner team581` on every `gh project` command.
- Projects belong to the org, not a repo. The repo on an issue/PR is independent of which project it's on.
- The active project is **2026 Offseason** (`--number 16`, project ID `PVT_kwDOAgSHEs4BXoJz`, <https://github.com/orgs/team581/projects/16>).

## Active project: 2026 Offseason

Issue field IDs, project field IDs, and single-select option IDs below are baked in for the 2026 Offseason project and `team581` org.

## Issue types

Enabled issue types for the `team581` org:

| Name      | ID                    | Description                                         |
| --------- | --------------------- | --------------------------------------------------- |
| Task      | `IT_kwDOAgSHEs4AaBHS` | A specific piece of work                            |
| Bug       | `IT_kwDOAgSHEs4AaBHW` | An unexpected problem or behavior                   |
| Feature   | `IT_kwDOAgSHEs4AaBHZ` | A request, idea, or new functionality               |
| Milestone | `IT_kwDOAgSHEs4BauCN` | A large body of work or project that is broken down |

When creating issues always assign a type if it's obvious which one to use. Leave blank otherwise.

## Issue fields

Prefer organization-level issue fields instead over project fields when possible.

| Field    | Field ID   |
| -------- | ---------- |
| Priority | `42596632` |
| Deadline | `42596637` |

Priority options:

| Name   | Option ID  |
| ------ | ---------- |
| Low    | `74542536` |
| Medium | `74542537` |
| High   | `74542538` |

Set an issue field value on an issue:

```sh
gh api --method POST \
  --header "X-GitHub-Api-Version: 2026-03-10" \
  /repos/<owner>/<repo>/issues/<issue-number>/issue-field-values \
  --input - <<'JSON'
{"issue_field_values":[{"field_id":42596632,"value":"Low"}]}
JSON
```

For single-select issue fields, use the option name as the value. Clear a field with:

```sh
gh api --method DELETE \
  --header "X-GitHub-Api-Version: 2026-03-10" \
  /repos/<owner>/<repo>/issues/<issue-number>/issue-field-values/<field-id>
```

## Project fields

Use project fields for project-only metadata.

| Field  | Field ID                         |
| ------ | -------------------------------- |
| Status | `PVTSSF_lADOAgSHEs4BXoJzzhSzwN0` |

Status options:

| Name             | Option ID  |
| ---------------- | ---------- |
| Todo             | `f75ad846` |
| In progress      | `47fc9ee4` |
| Ready for sim    | `300435aa` |
| Ready for tuning | `9338b5a2` |
| Done             | `98236657` |

Item IDs are per-item and always have to be looked up. List the board's items to find the one you want:

```sh
gh project item-list 16 --owner team581 --format json --limit 200
```

## Operations

Add an issue or PR (works for both URL types):

```sh
gh project item-add 16 --owner team581 --url <issue-or-pr-url>
```

Add an existing issue as a sub-issue of a parent issue:

```sh
sub_issue_id="$(gh api \
  --header "X-GitHub-Api-Version: 2026-03-10" \
  /repos/<owner>/<repo>/issues/<child-issue-number> \
  --jq .id)"

gh api --method POST \
  --header "X-GitHub-Api-Version: 2026-03-10" \
  /repos/<owner>/<repo>/issues/<parent-issue-number>/sub_issues \
  --field sub_issue_id="$sub_issue_id"
```

Edit a field on an item — one value flag per call, matching the field type: `--text`, `--number`, `--date YYYY-MM-DD`, `--iteration-id`, `--single-select-option-id`, or `--clear`.

```sh
gh project item-edit \
  --id <item-id> \
  --project-id PVT_kwDOAgSHEs4BXoJz \
  --field-id PVTSSF_lADOAgSHEs4BXoJzzhSzwN0 \
  --single-select-option-id f75ad846
```

If the user names a value for a single-select field that isn't in the tables above, ask rather than picking the closest match.

Create a draft item:

```sh
gh project item-create 16 --owner team581 --title "<title>" --body "<body>"
```
