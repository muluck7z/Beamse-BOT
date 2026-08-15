# Beamse-BOT

A Discord bot built with [Discord.js](https://discord.js.org/) featuring a **Ticket system** and **Moderation commands**, all in English.

## Features

### Ticket System (`/ticket`)

| Subcommand | Description |
| --- | --- |
| `/ticket panel [title] [thumbnail]` | Sends the ticket panel in the current channel (requires Manage Channels) |
| `/ticket add <user>` | Adds a user to the current ticket channel |
| `/ticket remove <user>` | Removes a user from the current ticket channel |

Ticket types available in the panel: **General Support**, **Questions**, **Report**, and **Billing**. Tickets support claiming, cancellation, closing with a 30-second countdown, service rating, and automatic logs.

### Moderation Commands

| Command | Permission | Description |
| --- | --- | --- |
| `/ban <user> [reason] [days]` | Ban Members | Bans a user and optionally deletes their messages (0–7 days) |
| `/unban <userid> [reason]` | Ban Members | Unbans a user |
| `/kick <user> [reason]` | Kick Members | Kicks a user from the server |
| `/mute <user> <duration> [reason]` | Moderate Members | Timeouts a user (e.g. `10m`, `1h`, `1d` — max 28d) |
| `/unmute <user> [reason]` | Moderate Members | Removes a timeout |
| `/warn add <user> <reason>` | Moderate Members | Adds a warning |
| `/warn list <user>` | Moderate Members | Lists a user's warnings |
| `/warn clear <user>` | Moderate Members | Clears a user's warnings |
| `/clear <amount> [user]` | Manage Messages | Bulk deletes messages (max 100, within 14 days) |
| `/lock [channel] [reason]` | Manage Channels | Locks a channel for @everyone |
| `/unlock [channel]` | Manage Channels | Unlocks a channel |

## Setup (Railway)

1. Push this repository to GitHub.
2. On [Railway](https://railway.com), create a new project and **Deploy from GitHub repo**.
3. Select the `Beamse-BOT` repository. Railway will automatically detect `railway.json` / `nixpacks.toml` and build the bot with nixpacks.
4. Add the following environment variables to the service:

| Variable | Value |
| --- | --- |
| `DISCORD_BOT_TOKEN` | Your bot token (from the Discord Developer Portal) |
| `DISCORD_CLIENT_ID` | Your application's client ID |
| `NODE_ENV` | `production` |

5. The bot starts automatically after deployment. No additional setup is required.

### Customization

Before deploying, edit the IDs in the code to match **your** server:

- `artifacts/api-server/src/bot/handlers/button.ts` — `RATING_CHANNEL_ID`, `LOG_CHANNEL_ID`, `TICKET_STAFF_ROLES`
- `artifacts/api-server/src/bot/handlers/selectMenu.ts` — `SUPPORT_ROLE_ID`
- `artifacts/api-server/src/bot/config.ts` — `IMMUNE_ROLE_ID`, `STAFF_ROLE_NAMES`

## Local Development

```bash
pnpm install
pnpm dev
```

Make sure `DISCORD_BOT_TOKEN` and `DISCORD_CLIENT_ID` are set in your environment.

## License

MIT
