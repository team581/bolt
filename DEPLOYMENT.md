# Junior production deployment

## Infrastructure

1. Provision the `Junior Postgres` and `Junior Redis` resources declared in `.railway/railway.ts`:

   ```bash
   railway config plan
   railway config apply
   ```

   Both databases run in Railway's US East region near the Vercel function region. The existing `Bolt` service and `Postgres` database remain declared for the rollback window.

2. Create or connect a Vercel project for Bolt and enable project OIDC.
3. Connect a private Vercel Blob store using OIDC.
4. Configure the variables documented in `.env.example` in the Vercel Production environment.
   - Use Railway's public `DATABASE_URL` and `REDIS_URL`.
   - Set `JUNIOR_DATABASE_DRIVER=postgres`.
   - Set `JUNIOR_BASE_URL` to Bolt's stable production origin, `https://bolt.frc581.com`.
   - Generate independent, stable values for `JUNIOR_SECRET` and `CRON_SECRET`.
   - Keep `VERCEL_SANDBOX_KEEPALIVE_MS=0` and `VERCEL_SANDBOX_WORKSPACE_DIR=/workspace`.
   - Reuse the existing bucket-scoped read-only `GCS_SERVICE_ACCOUNT_KEY` and GitHub App credentials.
   - Configure Dashboard Google OAuth credentials and allow the production origin as an OAuth redirect/trusted origin.
5. Deploy. Vercel runs Junior's SQL upgrade against the new database, prepares the sandbox snapshot, and builds Nitro.

Do not point the Slack app at the new deployment until `/health`, Dashboard sign-in, Railway connectivity, queue/cron bindings, Blob storage, and the sandbox snapshot have been verified.

## Google student group membership

The `google-groups` plugin uses the Cloud Identity Groups API with Bolt's existing server-side Google service account. Follow [Google's setup guide](https://docs.cloud.google.com/identity/docs/how-to/setup) for authentication without domain-wide delegation:

1. Enable the Cloud Identity API in the existing Google service account's Google Cloud project.
2. Make that service account an owner of **only** `students@team581.com`. Keep its existing read access to Workspace resources and keep a human group owner as well. Do not grant it a Workspace administrator role, domain-wide delegation, or membership in `coaches@team581.com`.
3. Set `GOOGLE_SERVICE_ACCOUNT_KEY` to its JSON key in the server environment. When upgrading, rename `GOOGLE_WORKSPACE_SERVICE_ACCOUNT_KEY` to `GOOGLE_SERVICE_ACCOUNT_KEY`; the old variable is no longer read. Keep `GCS_SERVICE_ACCOUNT_KEY` separate because it is copied into the sandbox for the read-only Fetch mount. Do not expose the server-side Google key to the sandbox.
4. Verify that `students@team581.com` permits external Google accounts, that regular members cannot manage membership or roles, and that this group is not nested in `coaches@team581.com` or any other privileged group.
5. Use `googleGroups_list_students` to verify authentication before performing an explicitly requested student addition or removal.

The Workspace plugins mint read-only tokens and the group plugin mints separate membership-write tokens from the same key. The group tools hardcode the student group and the `MEMBER` role. Coach changes remain manual because Bolt has no trusted mapping of Slack requesters to coach authorization. Junior's normal tool approval review also applies to student writes.

## Cutover

1. Confirm the Vercel deployment is healthy and `JUNIOR_CONVERSATION_WORK_ENABLED` is not disabled.
2. Scale the existing Mastra Railway application to zero so its scheduled tasks cannot fire.
3. Change Slack Event Subscriptions and Interactivity to `<JUNIOR_BASE_URL>/api/webhooks/slack`.
4. Reinstall the Slack app if its scopes changed.
5. Mention Bolt in a public channel and verify one thread reply, then verify a passive follow-up and an MPIM message.

This is an intentional clean cut. Mastra conversations, memory, and scheduled tasks are not copied.

## Acceptance checks

- A duplicate Slack delivery produces one response and a queued turn survives continuation/resume.
- An attached WPILOG can be loaded with Junior's attachment tool and analyzed.
- `/workspace/fetch` lists logs, reads a log, and rejects a write.
- `/workspace/offseason-2026/gradlew build` runs on Java 21.
- `gh api` performs REST and GraphQL reads, and a disposable GitHub Projects item can be created and removed.
- One-time and recurring Junior tasks pass Guardian review and deliver exactly once.
- Dashboard conversations/tasks and Sentry traces are visible.

## Rollback and retirement

To roll back, set `JUNIOR_CONVERSATION_WORK_ENABLED=false`, restore Slack's previous Mastra webhook URLs, and scale the Railway application back up.

Keep the stopped Mastra service and its database for 14 days. Remove them only after an explicit review confirms Junior is stable and no rollback is needed.
