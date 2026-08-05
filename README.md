# Bolt

Bolt <img src="./bolt.png" alt="Image of Bolt the dog" width="24px"/> is Team 581's Slack bot which helps our software team with project management, answering questions about robot code, debugging log files, and more.
Bolt uses Flue for durable agent execution and Chat SDK for its Slack interface.

To learn more about Bolt, check out:

- [INSTRUCTIONS.md](./src/agents/bolt/INSTRUCTIONS.md), which defines Bolt's responsibilities, behavior, and team context
- [Flue docs](https://flueframework.com)
- [Chat SDK Slack adapter](https://chat-sdk.dev/adapters/official/slack)

## Development

- Install and start Docker
- Install the mise tools with `mise install`
- Run `vp install`
- Copy `.env.example` to `.env.local` and set the remaining secrets
- Configure a Slack app from [slack-manifest.example.yaml](./slack-manifest.example.yaml)
- Generate an app-level Slack token with the `connections:write` scope and set it as `SLACK_APP_TOKEN`
- [Activate Pitchfork in your shell](https://pitchfork.jdx.dev/guides/shell-hook) so PostgreSQL and Bolt start when you enter the project and stop when you leave it

## Railway

- Add a PostgreSQL service and expose its `DATABASE_URL` to Bolt
- Configure the remaining values from `.env.example`
- Disable Socket Mode and set the Slack event request URL to `https://<deployment-host>/channels/slack/events`
- Deploy using [railway.json](./railway.json)
