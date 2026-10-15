---
name: manage-github-membership
description: Manage organization and team membership on GitHub.
license: MIT
---

# Manage GitHub membership

- Organization: `team581`
  - Team `students` for students
  - Team `coaches` for coaches
- Check organization membership: `gh api orgs/team581/memberships/USERNAME`
- Read either team (`TEAM_SLUG` is `students` or `coaches`): `gh api --paginate orgs/team581/teams/TEAM_SLUG/members` or `gh api orgs/team581/teams/TEAM_SLUG/memberships/USERNAME`
- Add a student: call `githubMembership_add_student` with their GitHub `username`
  - This also invites non-members to the organization; `pending` means they must accept
- Remove a student: call `githubMembership_remove_student` with their GitHub `username`
  - Does not change organization membership
- Coach team is read-only and will need to be manually updated if needed

## Workflow

- Students and coaches get added to their respective teams
- `students` team needs to be given read + write permissions on robot projects or other team-wide repositories
- Coaches all have admin perms at the user-level, don't need to explicitly add `coaches` to anything
