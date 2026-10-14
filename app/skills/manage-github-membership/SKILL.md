---
name: manage-github-membership
description: Manage organization and team membership on GitHub.
license: MIT
---

# Manage GitHub membership

- Organization: `team581`
  - Team `students` for students
  - Team `coaches` for coaches
  - Use these slugs for `TEAM_SLUG` below
- Check membership: `gh api orgs/team581/memberships/USERNAME` or `gh api orgs/team581/teams/TEAM_SLUG/memberships/USERNAME`
- Invite to the organization: `gh api --method PUT orgs/team581/memberships/USERNAME -f role=member`
- Add to a team: `gh api --method PUT orgs/team581/teams/TEAM_SLUG/memberships/USERNAME -f role=member`
  - This also invites non-members to the organization; `pending` means they must accept
- Remove from a team: `gh api --method DELETE orgs/team581/teams/TEAM_SLUG/memberships/USERNAME`
  - Does not change organization membership
- Remove from the organization or cancel a pending invitation: `gh api --method DELETE orgs/team581/memberships/USERNAME`

## Workflow

- Students and coaches get added to their respective teams
- `students` team needs to be given read + write permissions on robot projects or other team-wide repositories
- Coaches all have admin perms at the user-level, don't need to explicitly add `coaches` to anything
