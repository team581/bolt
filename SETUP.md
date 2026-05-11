# Bolt setup runbook

Bolt is Team 581's instance of [Junior](https://junior.sentry.dev) — a Slack bot that answers coding questions and manages GitHub issues/PRs.

This file is the operator runbook. Phase 1 (local scaffold) is already done in this repo. The remaining phases need accounts and secrets that can't be created from a terminal alone.

## Architecture choices for Team 581

- **Bot name:** `bolt` (set `JUNIOR_BOT_NAME=bolt`).
- **Deploy target:** Railway, not Vercel (the documented path). Nitro preset is `node-server`. The runtime is a long-lived Node process, so Slack's 3s ack and Vercel's `maxDuration` ceiling don't apply.
- **AI provider:** Vercel AI Gateway (`AI_GATEWAY_API_KEY`), Anthropic models. Junior's runtime is hardcoded to route all model traffic through the gateway — there is no direct-Anthropic path. Pay-as-you-go via Vercel credits for now.
- **Plugins enabled:** `@sentry/junior-github` only. No Linear/Notion/Sentry/Datadog/Hex. Agent-browser deferred.
- **GitHub Projects:** handled by the local `manage-github-projects` skill (not the packaged plugin). Driven through `gh project` over the same GitHub App installation token, which requires the extra org-level Projects permission below.

## Phase 2 — Vercel AI Gateway

1. Sign in at <https://vercel.com> (any account; you do not need to deploy anything here).
2. Open the **AI Gateway** dashboard → **API Keys** → create a key.
3. Save it as `AI_GATEWAY_API_KEY`.
4. Add a payment method on the Vercel team that owns the key — Junior will fail with `Missing AI gateway credentials` or per-request 402s otherwise.
5. The default models in `.env.example` (`anthropic/claude-sonnet-4.5`, `anthropic/claude-haiku-4.5`) are AI Gateway slugs. Browse the AI Gateway model catalog to swap if needed; the slug must match the gateway's catalog exactly.

## Phase 3 — Slack app

1. Go to <https://api.slack.com/apps> → **Create New App** → **From scratch**.
   - App Name: `Bolt`
   - Workspace: Team 581
2. **Basic Information** → copy the **Signing Secret** → save as `SLACK_SIGNING_SECRET`.
3. **OAuth & Permissions** → Bot Token Scopes. For student safety we deliberately scope Bolt to **public channels only** — no DMs, no group DMs, no private channels. Add **only**:
   - `app_mentions:read`
   - `chat:write`
   - `channels:history`
   - `users:read`
   - `files:read`
   - `reactions:write`

   Do **not** add `groups:history`, `im:history`, or `mpim:history`. Without those scopes, Slack will not deliver private-channel, DM, or group-DM messages to Bolt at all, even if a student tries to invite the bot into one.

4. **Install to Workspace** → copy the **Bot User OAuth Token** (starts with `xoxb-`) → save as `SLACK_BOT_TOKEN`.
5. **Event Subscriptions** → Enable Events. Request URL placeholder: `https://<temporary-tunnel>/api/webhooks/slack` (we'll replace this with the Railway URL in Phase 5).
   - Subscribe to bot events: `app_mention`, `message.channels`.
   - Do **not** subscribe to `message.groups`, `message.im`, or `message.mpim`. These would require the disallowed scopes anyway, and skipping them is a second layer of safety.
6. **Interactivity & Shortcuts** → Enable. Request URL: same as Event Subscriptions.
7. **App Home** → leave the **Messages tab disabled** so students cannot open a 1:1 DM with Bolt from the sidebar. The Home and About tabs are fine.

> **Student safety guarantee.** With the scopes and event subscriptions above, Slack will never deliver a DM, group DM, or private-channel message to Bolt's webhook. This is enforced by Slack itself; nothing in Bolt's code needs to filter messages. If a future operator ever re-enables any of `groups:history` / `im:history` / `mpim:history`, that protection is lost — treat those scopes as restricted.

## Phase 3.5 — Vercel Sandbox (code execution)

Junior runs all shell/git/test commands inside per-turn [Vercel Sandbox](https://vercel.com/docs/vercel-sandbox) microVMs. Even though Bolt itself is on Railway, Junior's runtime imports `@vercel/sandbox` directly and there is no built-in alternative. Setting the three Vercel credentials below unlocks Bolt's code-execution capabilities (cloning a repo, running `./gradlew`, opening a PR from a branch, etc.).

If these are left unset, Bolt still works for Q&A, GitHub issue/PR REST calls, comments, and labels — but anything that needs a shell will fail at runtime.

1. <https://vercel.com/signup> — create or sign in to a Vercel account.
2. Make sure you have (or create) a **team** on Vercel; note the **Team ID** (Team Settings → General → Team ID, looks like `team_…`).
3. Create a **placeholder project** on that team — Add New → Project → "Create Empty Project" or import any small stub repo. **Do not** import the bolt repo here; nothing will deploy from it. Open the project → Settings → General → copy the **Project ID** (`prj_…`).
4. Account avatar → **Account Settings** → **Tokens** → create a token named `bolt-sandbox`, scope **Full Account** (Sandbox needs broad access), expiration of your choice. Save the value (`vercel_…`) — Vercel only shows it once.
5. Confirm the team has billing/allowance for Sandbox compute (Team Settings → Billing).
6. Save the three values:
   - `VERCEL_TOKEN`
   - `VERCEL_TEAM_ID`
   - `VERCEL_PROJECT_ID`

## Phase 4 — GitHub App (org-wide)

1. <https://github.com/organizations/team581/settings/apps> → **New GitHub App**.
   - Name: `Team 581 Bolt` (must be globally unique).
   - Homepage URL: any (Railway URL once you have it).
   - Webhook: **disable** (Junior's GitHub plugin is outbound-only; it does not receive webhooks).
2. Repository permissions:
   - Actions: Read and write
   - Contents: Read and write
   - Issues: Read and write
   - Metadata: Read-only (required, default)
   - Pull requests: Read and write
3. Organization permissions:
   - Projects: Read and write (required by the `manage-github-projects` skill — `gh project` calls fail with `Resource not accessible by integration` without it).
4. Where can this app be installed? **Only on this account** (team581 org).
5. Create the app. On the resulting page:
   - Note the **App ID** → save as `GITHUB_APP_ID`.
   - **Generate a private key** → downloads a `.pem`. Move it somewhere safe outside this repo. The full file contents go into `GITHUB_APP_PRIVATE_KEY` (yes, multi-line, including BEGIN/END lines).
6. Sidebar → **Install App** → install on **All repositories** under team581. When prompted, accept the new **Projects: Read and write** organization permission — if you're upgrading an existing install rather than creating a fresh app, GitHub will require the org owner to re-approve the install before the new permission takes effect.
7. After install, the URL bar shows `/installations/<NUMBER>`. That number is `GITHUB_INSTALLATION_ID`.

## Phase 5 — Local verification (optional)

```sh
cp .env.example .env.local
# fill in every value from Phases 2 and 3
mise exec -- pnpm exec junior check    # should pass
mise exec -- pnpm dev                  # http://localhost:3000/health -> 200
```

For Slack to reach localhost during development:

```sh
# in another terminal
ngrok http 3000
# or: cloudflared tunnel --url http://localhost:3000
```

Then update the Slack app's Event Subscriptions and Interactivity Request URLs to `https://<tunnel>/api/webhooks/slack`. Slack will hit the URL once and Bolt should respond with the `challenge` value to verify.

In a test channel, invite Bolt and try:

```
@Bolt hello
@Bolt create a GitHub issue in team581/<some-repo> titled "Bolt smoke test" with body "verification"
```

## Phase 6 — Deploy to Railway

1. Push this repo to GitHub under `team581/bolt` (private).
2. <https://railway.app> → **New Project** → **Deploy from GitHub repo** → pick `team581/bolt`.
3. Add a **Redis** database to the project. Railway exposes a `REDIS_URL` automatically.
4. In the Bolt service → **Variables**, add everything from `.env.example` plus:
   - `JUNIOR_BASE_URL=https://<railway-domain>` (set after first deploy assigns one)
   - `REDIS_URL` — reference Railway's variable from the Redis plugin (e.g. `${{Redis.REDIS_URL}}`).
   - `VERCEL_TOKEN`, `VERCEL_TEAM_ID`, `VERCEL_PROJECT_ID` from Phase 3.5.
5. Confirm `railway.json` is being respected:
   - Build: `pnpm install --frozen-lockfile && pnpm build`
   - Start: `pnpm start` (runs `node .output/server/index.mjs`)
   - Healthcheck: `/health`
6. Once deployed, hit `https://<railway-domain>/health`. Expect 200.
7. Update Slack Event Subscriptions and Interactivity Request URLs to `https://<railway-domain>/api/webhooks/slack`.

### Build-time snapshot warmup caveat

`pnpm build` runs `junior snapshot create` first. The Junior docs say this needs `REDIS_URL` available **at build time** and was originally designed around Vercel OIDC. On Railway, exposing `REDIS_URL` to the build is enough — Railway injects service variables into Nixpacks builds when they reference the same project. If `junior snapshot create` fails the build:

- Quick workaround: change the `build` script to `nitro build` only and let Bolt warm at first request.
- Better fix: add a Railway pre-deploy hook that runs `pnpm exec junior snapshot create` with `REDIS_URL` set, and keep the `build` step pure-Nitro.

## Phase 7 — End-to-end verification

In Slack (production workspace):

1. `@Bolt how do we wire a swerve module's azimuth motor in Java?` → expect a code-aware reply that mentions WPILib/CTRE patterns.
2. `@Bolt create a GitHub issue in team581/<repo> titled "Bolt prod smoke" with body "verification"` → expect the issue to be created and authored by the GitHub App identity.
3. Reply in the same Slack thread: `@Bolt comment on that issue saying "verified"` → expect the comment to land.
4. Check the Railway logs for `/api/webhooks/slack` → 200 responses and a healthy queue worker.

## What's deliberately not set up yet

- **Other plugins** — Linear, Notion, Sentry, Agent Browser. Add later as needs arise; each one needs its own credential setup.
- **Sentry monitoring** — `SENTRY_DSN` is in `.env.example` but unset; create a Sentry project for Bolt before going to prod.
