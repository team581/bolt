# Bolt

Bolt <img src="./bolt.png" alt="Image of Bolt the dog" width="24px"/> is Team 581's Slack bot which helps our software team with project management, answering questions about robot code, debugging log files, and more.
Bolt uses Flue for durable agent execution and Chat SDK for its Slack interface.

To learn more about Bolt, check out:

- [INSTRUCTIONS.md](./src/agents/bolt/INSTRUCTIONS.md), which defines Bolt's responsibilities, behavior, and team context
- [Flue docs](https://flueframework.com)
- [Chat SDK Slack adapter](https://chat-sdk.dev/adapters/official/slack)

## Development

- Run `vp install`
- Copy `.env.example` to `.env` and set all the secrets
- Run PostgreSQL locally and set `DATABASE_URL`
- Configure a Slack app from [slack-manifest.example.yaml](./slack-manifest.example.yaml), replacing its request URL with a public URL that forwards to `/channels/slack/events`
- Run `vp dev`

## Railway

- Add a PostgreSQL service and expose its `DATABASE_URL` to Bolt
- Configure the remaining values from `.env.example`
- Deploy using [railway.json](./railway.json)
