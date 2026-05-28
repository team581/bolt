# Bolt setup runbook

Bolt is Team 581's instance of [Junior](https://junior.sentry.dev) — a Slack bot that answers coding questions and manages GitHub issues/PRs.

The [Junior docs](https://junior.sentry.dev/start-here/quickstart/) are the source of truth for general setup and env vars. This file only documents Team 581's deviations. Use `.env.example` as the canonical variable checklist.

## Follow the Junior docs

Work through these pages, applying the deviations below as you go:

1. [Quickstart](https://junior.sentry.dev/start-here/quickstart/) — app shape, env, running locally.
2. [Slack App Setup](https://junior.sentry.dev/start-here/slack-app-setup/) — but use our restricted scopes.
3. [GitHub Plugin](https://junior.sentry.dev/extend/github-plugin/) — but create the app org-wide with org Projects permission.
4. Skip [Deploy to Vercel](https://junior.sentry.dev/start-here/deploy-to-vercel/), we run on Railway.

## Team 581 deviations

### Toolchain: Vite+

This repo uses Vite+ (`vp`). Wherever the docs say `pnpm dev` / `pnpm build` / `pnpm check`, run `vp dev` / `vp build` / `vp check`.

### Deploy target: Railway, not Vercel

We deploy to Railway with the Nitro `node-server` preset (a long-lived Node process), so Slack's 3s ack and Vercel's `maxDuration` ceiling don't apply, and there is no Vercel Cron.

- `railway.json` defines the build, start, and `/health` healthcheck. The `build:release` script also injects and uploads Sentry source maps.
- Add a **Redis** plugin and reference it as `REDIS_URL=${{Redis.REDIS_URL}}`.
- Set `JUNIOR_BASE_URL` after the first deploy assigns a domain.
- We use `JUNIOR_SCHEDULER_SECRET` for the scheduled-task heartbeat in place of the docs' Vercel-Cron `CRON_SECRET`.
- Point Slack's Event Subscriptions, Interactivity, and `/jr` URLs at `https://<railway-domain>/api/webhooks/slack`.

> Snapshot warmup (`junior snapshot create`) needs `REDIS_URL` at build time. Railway injects service variables into builds that reference the same project, so this works as-is. If the build fails on snapshot creation, fall back to a pure-Nitro build and let Bolt warm at first request.

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

### Vercel Sandbox still required

Even on Railway, Junior imports `@vercel/sandbox` directly to run all shell/git/test commands in per-turn microVMs. Without the Vercel sandbox credentials, Bolt still handles Q&A, GitHub REST calls, comments, and labels, but anything needing a shell fails. Create a Vercel team plus a placeholder project (make sure to disable production builds/deploys if GitHub is linked) and a Full-Account token.

### AI provider: Vercel AI Gateway

Junior routes all model traffic through Vercel AI Gateway. Create a key, set `AI_GATEWAY_API_KEY`, and add a payment method (otherwise turns 402). Model slugs in `.env.example` must match the gateway catalog exactly.

### CI: prompt regeneration

`.github/workflows/autofix.yml` regenerates prompt files from `gh project` on every push. The default `GITHUB_TOKEN` cannot read org-level Projects v2, so expose the app credentials as repository CI settings: `BOLT_GITHUB_APP_ID` (a **variable**) and `BOLT_GITHUB_APP_PRIVATE_KEY` (a **secret**).

## What's deliberately not set up yet

- **Other plugins** — Linear, Notion, Sentry, Datadog, Hex, Agent Browser. Only `@sentry/junior-github` is enabled.
