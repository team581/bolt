---
name: manage-github-projects
description: Read and update our GitHub Projects board via the gh CLI. Use when users ask about project management, task tracking, milestones, etc.
license: MIT
---

# Manage GitHub Projects

Drive Team 581's GitHub Projects (v2) boards through the `gh project` CLI.

## Team 581 conventions

- The org is always `team581`. Pass `--owner team581` on every `gh project` command.
- Projects belong to the org, not a repo. The repo on an issue/PR is independent of which project it's on.
- The active project is **2026 Offseason** (`--number 16`, project ID `PVT_kwDOAgSHEs4BXoJz`, <https://github.com/orgs/team581/projects/16>).

## Active project: 2026 Offseason

Field IDs and single-select option IDs below are baked in for the 2026 Offseason project.

## Issue types

Enabled issue types for the `team581` org:

| Name      | ID                    | Description                                         |
| --------- | --------------------- | --------------------------------------------------- |
| Task      | `IT_kwDOAgSHEs4AaBHS` | A specific piece of work                            |
| Bug       | `IT_kwDOAgSHEs4AaBHW` | An unexpected problem or behavior                   |
| Feature   | `IT_kwDOAgSHEs4AaBHZ` | A request, idea, or new functionality               |
| Milestone | `IT_kwDOAgSHEs4BauCN` | A large body of work or project that is broken down |

When creating issues always assign a type if it's obvious which one to use. Leave blank otherwise.

| Field    | Field ID                         |
| -------- | -------------------------------- |
| Status   | `PVTSSF_lADOAgSHEs4BXoJzzhSzwN0` |
| Created  | `PVTF_lADOAgSHEs4BXoJzzhSzwOY`   |
| Updated  | `PVTF_lADOAgSHEs4BXoJzzhSzwOc`   |
| Closed   | `PVTF_lADOAgSHEs4BXoJzzhSzwOg`   |
| Priority | `PVTSSF_lADOAgSHEs4BXoJzzhSzwOk` |
| Deadline | `PVTF_lADOAgSHEs4BXoJzzhSzwOo`   |

Status options:

| Name             | Option ID  |
| ---------------- | ---------- |
| Todo             | `f75ad846` |
| In progress      | `47fc9ee4` |
| Ready for sim    | `300435aa` |
| Ready for tuning | `9338b5a2` |
| Done             | `98236657` |

Priority options:

| Name   | Option ID  |
| ------ | ---------- |
| Low    | `d44db003` |
| Medium | `4494efdf` |
| High   | `0fdd587c` |

Item IDs are per-item and always have to be looked up. List the board's items to find the one you want:

```sh
gh project item-list 16 --owner team581 --format json --limit 200
```

## Operations

Add an issue or PR (works for both URL types):

```sh
gh project item-add 16 --owner team581 --url <issue-or-pr-url>
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
