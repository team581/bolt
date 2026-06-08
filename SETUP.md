# Bolt setup runbook

Bolt is Team 581's instance of [Junior](https://junior.sentry.dev) — a Slack bot that answers coding questions and manages GitHub issues/PRs.

The [Junior docs](https://junior.sentry.dev/start-here/quickstart/) are the source of truth for general setup and env vars. This file only documents Team 581's deviations. Use `.env.example` as the canonical variable checklist.

## Follow the Junior docs

Work through these pages, applying the deviations below as you go:

1. [Quickstart](https://junior.sentry.dev/start-here/quickstart/) — app shape, env, running locally.
2. [Slack App Setup](https://junior.sentry.dev/start-here/slack-app-setup/) — but use our restricted scopes.
3. [GitHub Plugin](https://junior.sentry.dev/extend/github-plugin/) — but create the app org-wide with org Projects permission.
4. [Scheduler Plugin](https://junior.sentry.dev/extend/scheduler-plugin/) — Bolt uses Junior's Vercel Cron heartbeat.
5. [Deploy to Vercel](https://junior.sentry.dev/start-here/deploy-to-vercel/) — use the Team 581 `bolt` Vercel project.

## Team 581 deviations

### Toolchain: Vite+

This repo uses Vite+ (`vp`). Wherever the docs say `pnpm dev` / `pnpm build` / `pnpm check`, run `vp dev` / `vp build` / `vp check`.

### Deploy target: Vercel

We deploy to the Team 581 `bolt` Vercel project with Nitro's `vercel` preset. The project is linked locally with the Vercel CLI, but `.vercel/` must stay uncommitted.

- `vercel.json` sets the Nitro framework and runs `pnpm build:release`, which creates the Junior sandbox snapshot, builds Bolt, and uploads Sentry source maps from `.vercel/output/functions/__server.func`.
- Set the variables from `.env.example` in Vercel, including `REDIS_URL`, `CRON_SECRET`, and the Sentry build variables.
- Use an external Redis provider or Vercel Marketplace Redis for `REDIS_URL`;
- Set `JUNIOR_BASE_URL` to Bolt's final production/custom Vercel domain.
- Junior's Nitro module emits the `/api/internal/heartbeat` Vercel Cron entry and queue trigger. Do not add a duplicate root-level `crons` entry to `vercel.json`.
- `CRON_SECRET` is required for Vercel Cron to call `/api/internal/heartbeat`; set `JUNIOR_TIMEZONE` if schedule authoring should use a default other than `America/Los_Angeles`.
- Point Slack's Event Subscriptions, Interactivity, and `/jr` URLs at `https://<vercel-domain>/api/webhooks/slack`.
- Add Google OAuth redirect/callback URLs for the same Vercel domain when dashboard auth is enabled.

> Snapshot warmup (`junior snapshot create`) needs `REDIS_URL` and Vercel Sandbox credentials at build time. Make sure Vercel exposes them to the build environment. If snapshot creation must be skipped temporarily, set `JUNIOR_SKIP_SNAPSHOT=1` and let Bolt warm at first request.

### Slack: public channels only (student safety)

For student safety, Bolt is deliberately scoped to **public channels only** — no DMs, group DMs, or private channels. This diverges from the Junior docs, which assume DM/`im` scopes.

- Bot token scopes: `app_mentions:read`, `chat:write`, `channels:history`, `users:read`, `files:read`, `reactions:write`, `canvases:read`, `canvases:write`.
- Event subscriptions: `app_mention`, `message.channels` only.
- Do **not** add `groups:history`, `im:history`, or `mpim:history`, do **not** subscribe to `message.groups`/`message.im`/`message.mpim`, and leave the App Home **Messages tab disabled**.

> **Guarantee:** with these scopes, Slack itself never delivers a DM, group DM, or private-channel message to Bolt — no code-side filtering is needed. Treat the three `*_history` scopes as restricted; re-enabling any breaks this protection.

### GitHub App: org-wide with Projects permission

When creating the app per the GitHub Plugin doc:

- Install on **All repositories** under the team581 org, webhook disabled.
- In addition to the doc's repository permissions, grant **Organization → Projects: Read and write**.

### Vercel Sandbox

Junior imports `@vercel/sandbox` directly to run all shell/git/test commands in per-turn microVMs. Without the Vercel sandbox credentials, Bolt still handles Q&A, GitHub REST calls, comments, and labels, but anything needing a shell fails. Use the Bolt Vercel project unless a separate sandbox project is intentionally preferred, and create a Full-Account token.

### AI provider: Vercel AI Gateway

Junior routes all model traffic through Vercel AI Gateway. Create a key, set `AI_GATEWAY_API_KEY`, and add a payment method (otherwise turns 402). Model slugs in `.env.example` must match the gateway catalog exactly.

### CI: prompt regeneration

`.github/workflows/autofix.yml` regenerates prompt files from `gh project` on every push. The default `GITHUB_TOKEN` cannot read org-level Projects v2, so expose the app credentials as repository CI settings: `BOLT_GITHUB_APP_ID` (a **variable**) and `BOLT_GITHUB_APP_PRIVATE_KEY` (a **secret**).

## What's deliberately not set up yet

- **Other plugins** — Linear, Notion, Sentry, Datadog, Hex, Agent Browser. Only `@sentry/junior-github` and `@sentry/junior-scheduler` are enabled.
