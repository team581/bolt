# Bolt

Bolt <img src="./bolt.png" alt="Image of Bolt the dog" width="24px"/> is Team 581's Slack bot which helps our software team with project management, answering questions about robot code, debugging log files, and more.
Bolt is built on the Flue agent framework.

To learn more about Bolt check out:

- [SOUL.md](./app/SOUL.md), which defines high-level guidelines for Bolt's responsibilities and behavior
- [WORLD.md](./app/WORLD.md), which contains context on how the Team 581 software team operates
- [SETUP.md](./SETUP.md), our internal deploy guide for running Bolt on Vercel
- [Flue docs](https://flueframework.com)

## Development

For local development:

- Copy `.env.example` to `.env` and set all the secrets
- `vp dev` to start the development server

## Slack

Configure the Slack app with the `app_mentions:read` and `chat:write` bot scopes.
Enable Event Subscriptions, set the request URL to `https://<deployment>/channels/slack/events`, and subscribe to the `app_mention` bot event.
Bolt keeps one conversation per Slack thread and posts replies back into that thread.
