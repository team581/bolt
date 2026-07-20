---
name: update-junior
description: Instructions on how to update the Junior npm package(s)
---

A new Junior release is available. Update every direct `@sentry/junior` and `@sentry/junior-*` dependency to the same exact target version, run `pnpm install`, and resolve any conflicts with our local Junior patch in `@/patches/@sentry__junior.patch`.

If you're on a Renovate update branch, keep whatever version is configured there. Need to be mindful of pnpm minimum release age, we don't want to add any exceptions.

## Workflow

1. Run a preflight check with `git status --short` and stop if `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, or `patches/@sentry__junior.patch` has unrelated user changes.
2. Inventory direct Junior dependencies in `package.json`. Record package name, current version, and dependency section. Do not move packages between sections.
3. Resolve the target version with `pnpm view @sentry/junior dist-tags.latest` unless the user requested a specific version. Verify the target exists for every inventoried Junior package with `pnpm view <package> version` before mutating files.
4. Build release context before updating:
   - Junior does not publish GitHub releases, git tags, or a changelog.
   - Use `pnpm view @sentry/junior time --json` to find the old and target publish timestamps.
   - Review merged PRs or commits in `getsentry/junior` between those timestamps. The local clone is in `~/programming/junior`.
   - Call out breaking changes, especially conventional commit `!` markers or `BREAKING CHANGE`, and config-relevant changes involving config, plugins, Nitro, `createApp`, runtime, credentials, egress, or examples.
5. Update dependencies section-preservingly. Prefer `pnpm add -E ...` for dependencies, `pnpm add -D -E ...` for dev dependencies, and `pnpm add -O -E ...` for optional dependencies. Do not manually edit Junior versions in `package.json`.
6. If `pnpm-workspace.yaml` has `minimumReleaseAgeExclude`, ensure every Junior package from the inventory is listed.
7. Run `pnpm install`. If the local Junior patch conflicts, inspect the upstream change and update `patches/@sentry__junior.patch` with the smallest necessary adjustment.
8. Compare Bolt's Junior-facing config against the Junior example app for the target version, focusing on structural changes in `juniorNitro(...)`, plugin registration, plugin factory signatures, `createApp(...)`, and required support dev dependencies such as `nitro`, `jiti`, and `typescript`. Ignore app-local differences like env var names, local plugin and skill registrations, custom defaults, and Slack personality content.
9. Apply only obvious low-risk Bolt config fixes automatically. If a breaking or ambiguous upstream change needs a product decision, provide context and ask the user for next steps.
10. Verify:
    - `pnpm install --frozen-lockfile`
    - `vp check`
    - `vp test`
    - Run `vp build` if runtime, Nitro, plugin registration, or build config changed.

## Final summary

Report the old and new Junior versions, updated packages, release-context summary, config comparison findings, patch changes, check results, and any unexpected diffs. If it is not obvious what Bolt itself should change as part of the update, provide context and ask for next steps.
