# Bolt

Bolt <img src="./bolt.png" alt="Image of Bolt the dog" width="24px"/> is Team 581's Slack agent for project management, robot-code questions, and WPILOG analysis.

Junior owns Slack ingestion, durable conversations, scheduled tasks, attachments, queues, and persistent Vercel Sandboxes. Bolt adds only its own instructions, skills, and a local sandbox-preparation plugin. It does not register Junior's GitHub, memory, or other provider plugins.

## Development

1. Install Docker and the mise tools with `mise install`.
2. Run `vp install`.
3. Copy `.env.example` to `.env.local` and fill in the required Slack, Junior, Google OAuth, GitHub App, GCS, and AI Gateway values.
4. Run `mise run dev`. Pitchfork starts local Postgres and Redis, Junior applies its SQL migrations, and Nitro starts on port 3000.
5. Enable Socket Mode on the test Slack app and create an app-level token with `connections:write`.
6. In a second terminal, run `mise run slack:socket`. The listener forwards Slack events to Junior at `JUNIOR_BASE_URL`, which defaults to `http://localhost:3000`.

Production continues to use Junior's HTTP webhook at `/api/webhooks/slack`; the Socket Mode listener is only a local development process.

Useful checks:

```sh
vp run check:junior
vp check
vp test
vp run build
```

The production release build additionally creates the cached Vercel Sandbox snapshot:

```sh
vp run build:release
```

## Runtime

- Agent instructions: [`app/SOUL.md`](./app/SOUL.md) and [`app/WORLD.md`](./app/WORLD.md)
- Custom skills: [`app/skills`](./app/skills)
- Sandbox setup: [`app/plugins/bolt-runtime.ts`](./app/plugins/bolt-runtime.ts)
- Production rollout: [`DEPLOYMENT.md`](./DEPLOYMENT.md)

The sandbox plugin installs Java 21, GitHub CLI, `jq`, and Cloud Storage FUSE into Junior's snapshot. It maintains `/workspace/offseason-2026`, mounts `fetch_storage` read-only at `/workspace/fetch`, and injects a fresh GitHub App installation token into each Bash command. Junior does not inspect or restrict those GitHub commands.
