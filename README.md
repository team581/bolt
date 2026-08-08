# Bolt

Bolt <img src="./bolt.png" alt="Image of Bolt the dog" width="24px"/> is Team 581's Slack bot which helps our software team with project management, answering questions about robot code, debugging log files, and more.
Bolt uses Mastra for its agent runtime, Slack interface, memory, and observability. Code execution runs in persistent Daytona sandboxes built from the image in [`sandbox/`](./sandbox/).

To learn more about Bolt, check out:

- [instructions.md](./src/mastra/agents/bolt/instructions.md), which defines Bolt's responsibilities, behavior, and team context
- [Mastra docs](https://mastra.ai/docs)
- [Chat SDK Slack adapter](https://chat-sdk.dev/adapters/official/slack)
- [Mastra Daytona workspace provider](https://mastra.ai/docs/workspace/sandbox)

## Development

- Install and start Docker
- Install the mise tools with `mise install`
- Run `vp install`
- Copy `.env.example` to `.env.local` and set the remaining secrets
- Create a Daytona API key and set it as `DAYTONA_API_KEY`
- Configure a Slack app from [slack-manifest.example.yaml](./slack-manifest.example.yaml), then enable Socket Mode for development
- Generate an app-level Slack token with the `connections:write` scope and set it as `SLACK_APP_TOKEN`
- [Activate Pitchfork in your shell](https://pitchfork.jdx.dev/guides/shell-hook) so PostgreSQL starts when you enter the project and stops when you leave it
- Run `mise run dev` to start Bolt in the foreground; press Ctrl-C to stop it

## Railway

- Add a PostgreSQL service and expose its `DATABASE_URL` to Bolt
- Configure the remaining values from `.env.example`
- Keep Socket Mode disabled and set both the Slack event and interactivity request URLs to `https://<deployment-host>/api/agents/bolt/channels/slack/webhook`
- Deploy using [railway.json](./railway.json)

Mastra creates its own PostgreSQL tables and Daytona workspaces. The previous Flue tables and Modal workspaces are intentionally not migrated or deleted during rollout, so they remain available for rollback until they are cleaned up separately.
