# Free Fire Guild HQ

A tactical guild management dashboard built with React, Vite, TypeScript, MongoDB Atlas, and Discord OAuth2.

## Features

- Discord OAuth2 login with server-side token exchange
- HttpOnly session cookie and OAuth state protection
- MongoDB-backed members, events, announcements, and join applications
- Admin and co-admin management tools
- Guild join form with image upload selection and terms acceptance
- Admin approval, rejection, suspension, and role management
- Persistent local data fallback when MongoDB is unavailable

## Requirements

- Node.js 18 or newer
- npm
- A MongoDB Atlas account and cluster
- A Discord application created in the Discord Developer Portal

## Install

From the project directory:

```bash
npm install
```

## MongoDB Atlas Setup

1. Open [MongoDB Atlas](https://www.mongodb.com/atlas) and create or select a cluster.
2. Open **Database Access** and create a database user.
3. Give that user read/write access to the `free_fire_guild` database.
4. Open **Network Access** and add your current IP address.
5. For temporary local testing only, you can allow `0.0.0.0/0`. Restrict this before production.
6. Select **Connect -> Drivers -> Node.js** and copy the connection string.

The application uses these MongoDB collections:

- `members`
- `events`
- `announcements`

The collections are created automatically when the first document is written.

MongoDB is required for data to survive a redeploy on hosts with ephemeral filesystems. Keep the same `MONGODB_URI` and `MONGODB_DB` environment variables configured on every deployment. When MongoDB is unavailable, the API stores saved content in `server/data.json`; this fallback survives normal server restarts and works on hosts with persistent disks, but it is not a redeploy-safe substitute for MongoDB.

## Discord OAuth Setup

1. Open the [Discord Developer Portal](https://discord.com/developers/applications).
2. Create an application or open an existing one.
3. Open **OAuth2 -> General**.
4. Copy the **Client ID**.
5. Reset and copy the **Client Secret**.
6. Add this redirect URL under **Redirects**:

```text
http://localhost:3001/auth/discord/callback
```

7. The application requests the `identify` scope only.
8. Copy your Discord user ID for the admin account. Enable Developer Mode in Discord, then right-click your profile and choose **Copy User ID**.
Automatic ranking tasks triggered by Discord channel messages require the bot's **Message Content Intent** and **Guild Messages Intent** to be enabled in the Discord Developer Portal under **Bot > Privileged Gateway Intents**. The bot must also be able to read messages in the guild channels.

Private DM and guild chat browser notifications require each recipient device to open Chat once and click **Enable alerts**. The browser must grant notification permission. Notifications work while the website tab is open or running in the background; true notifications after the site is fully closed require a Web Push service with VAPID keys.



### Optional Discord Bot Role Sync

Users must be members of the Discord server before they can access the website. The server checks membership through the bot before creating a session. Invite users with: https://discord.gg/78bscsw4Yr

For automatic guild-owner and co-admin role detection, add a Discord bot to the guild with permission to view the server and members. Set these server-only values:

```env
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_GUILD_ID=your_discord_server_id
DISCORD_COADMIN_ROLE_ID=your_discord_coadmin_role_id
DISCORD_REPORT_CHANNEL_ID=your_discord_report_channel_id
```

The guild owner is treated as `admin`. Members with the configured Discord role are treated as `coadmin`. Without these values, the app falls back to `DISCORD_ADMIN_IDS`, and the owner can assign roles from Admin Command.

The bot monitors non-bot Discord messages for automatic Discord-activity ranking tasks. It registers a guild-only `/top` command for the current all-time top 10 members. When `DISCORD_REPORT_CHANNEL_ID` is set, it posts a weekly ranking report every Monday at 09:00 UTC using points awarded during the previous seven days. The bot needs permission to view the channel and send messages.

## Environment Variables

Create a local `.env` file from the example:

```bash
cp .env.example .env
```

Set the values in `.env`:

```env
MONGODB_USERNAME=your_atlas_username
MONGODB_PASSWORD=your_atlas_password
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@YOUR-CLUSTER.mongodb.net/?retryWrites=true&w=majority&appName=freefireguild
MONGODB_DB=free_fire_guild
MONGODB_URI_2=mongodb+srv://RANKING_USER:RANKING_PASSWORD@RANKING_CLUSTER.mongodb.net/?retryWrites=true&w=majority
RANKING_MONGODB_DB=free_fire_rankings
MONGODB_URI_3=mongodb+srv://CHAT_USER:CHAT_PASSWORD@CHAT_CLUSTER.mongodb.net/?retryWrites=true&w=majority
CHAT_MONGODB_DB=free_fire_chat
HLGAMING_STATS_API_URL=https://proapis.hlgamingofficial.com/main/games/freefire/stats/api
HLGAMING_ACCOUNT_API_URL=https://proapis.hlgamingofficial.com/main/games/freefire/account/api
HLGAMING_USER_UID=your_hl_gaming_developer_uid
HLGAMING_API_KEY=your_hl_gaming_api_key
HLGAMING_GUILD_API_KEY=your_separate_guild_owner_api_key
HLGAMING_MEMBER_API_KEY_1=your_member_pool_api_key_1
HLGAMING_MEMBER_API_KEY_2=your_member_pool_api_key_2
HLGAMING_MAX_MEMBER_REFRESHES_PER_KEY=10
HLGAMING_REGION=ind
API_PORT=3001

APP_URL=http://localhost:5173
DISCORD_CLIENT_ID=your_discord_application_client_id
DISCORD_CLIENT_SECRET=your_discord_application_client_secret
DISCORD_REDIRECT_URI=http://localhost:3001/auth/discord/callback
DISCORD_ADMIN_IDS=your_discord_user_id
```

`MONGODB_URI`, `MONGODB_URI_2`, `MONGODB_URI_3`, `DISCORD_CLIENT_SECRET`, `RANKING_MONGODB_DB`, and `CHAT_MONGODB_DB` are server-only values. Ranking tasks and score awards use `MONGODB_URI_2`; chat messages use `MONGODB_URI_3`. Both can belong to separate MongoDB accounts or clusters. Never prefix server values with `VITE_`, commit secrets, or expose them in frontend code.

HL Gaming data is refreshed on Monday at 04:00 Asia/Kolkata time. `HLGAMING_GUILD_API_KEY` is used for the guild owner/profile. The two member pool keys are reserved only for approved acting leaders (`coadmin`), elders (`moderator`), and guild members (`member`); they are never used for other roles. Members can add a personal key from Settings; the key is validated before storage, encrypted server-side, and stored in the ranking database. A personal key is preferred for that member and can be used regardless of role. Invalid keys are not stored, provider-rejected keys are removed, and keys with no successful use for 30 days are deleted. `HLGAMING_MAX_MEMBER_REFRESHES_PER_KEY` limits the scheduled workload per shared key so provider quotas are not intentionally exceeded. Cached results are stored in the primary guild database collection `free_fire_stats` and displayed read-only. Obtain HL Gaming credentials from their [API dashboard](https://www.hlgamingofficial.com/p/api.html), and confirm their terms and limits before production use; this is a third-party provider, not a Garena API.

A single 512 MB MongoDB database is enough for the cached stats collection for a normal guild. At an intentionally conservative 100 KB per member, it can hold roughly 5,000 cached member records; keeping chat and profile images in separate storage leaves substantially more room. You do not need one database per member. Add another database only when your provider quota, chat volume, backups, or total application data requires it.

If the MongoDB password contains characters such as `@`, `#`, `/`, `:`, or spaces, URL-encode the password before placing it in the connection string.

## Run Locally

Start both the API and Vite frontend:

```bash
npm run dev:full
```

Open:

```text
http://localhost:5173
```

## Deploy With Netlify and Render

Deploy the Express API to Render and the Vite frontend to Netlify.

1. Push this repository to GitHub.
2. In Render, create a Blueprint from the repository. The existing `render.yaml` creates the `free-fire-guild-api` web service.
3. In Render, set every `sync: false` value from `render.yaml`, including `APP_URL`. Set `APP_URL` to the final Netlify URL, for example `https://your-site.netlify.app`.
4. Set `DISCORD_REDIRECT_URI` to `https://your-site.netlify.app/auth/discord/callback` and add that exact URL in Discord Developer Portal -> OAuth2 -> Redirects. Netlify proxies `/auth/*` to Render, so the browser keeps the session cookie on the Netlify domain.
5. In Netlify, import the same repository. Netlify uses `netlify.toml`, runs `npm run build`, and publishes `dist`.
6. In Netlify environment variables, remove `VITE_BACKEND_URL` or leave it empty. The committed `netlify.toml` proxies `/api/*` and `/auth/*` to Render.
7. Redeploy both services after setting the URLs. Test login, API health at `/api/health`, Discord OAuth, and WebSocket chat.

Keep server secrets only in Render. `VITE_BACKEND_URL` is public configuration and is safe to expose in the frontend bundle.

You can also start them separately:

```bash
npm run api
npm run dev
```

The API listens on `http://localhost:3001`. Vite proxies `/api/*` and `/auth/*` to the API during development.

## Verify the API

Check that the API is running:

```bash
curl http://localhost:3001/api/health
```

With a reachable Atlas cluster, the response should be:

```json
{"database":true,"status":"ok"}
```

Check the current login session:

```bash
curl -i http://localhost:3001/api/auth/me
```

A logged-out response is expected to be HTTP `401`.

## Login Flow

1. The user clicks **Login with Discord**.
2. The API creates a one-time OAuth state value.
3. Discord authenticates the user and redirects to `/auth/discord/callback`.
4. The API exchanges the authorization code server-side.
5. The API loads or creates the member in MongoDB.
6. The API creates an HttpOnly session cookie.
7. The browser returns to the frontend.

Users listed in `DISCORD_ADMIN_IDS` are created as approved `admin` members. Other first-time users are created as pending `recruit` members and must submit their join application.

## Join and Approval Flow

- A user opens **Join Guild**.
- The user must provide a name, Free Fire ID, image selection, and accept the terms.
- Logged-in users can submit the request.
- Logged-out users are redirected to Discord login when they submit.
- Admins and co-admins review pending applications in **Admin Command**.
- Approved users receive guild access.

## Available Commands

```bash
npm run dev        # Start Vite only
npm run api        # Start the MongoDB/Discord API only
npm run dev:full   # Start API and Vite together
npm run typecheck  # Run TypeScript validation
npm run build      # Create a production frontend build
npm run preview    # Preview the production build
npm run lint       # Run ESLint
```

## Troubleshooting

### `Discord OAuth is not configured`

Confirm these values exist in `.env` and restart the API:

- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_REDIRECT_URI`

### `redirect_uri_mismatch`

The redirect URL must match exactly in both places:

```text
http://localhost:3001/auth/discord/callback
```

Check for differences in port, protocol, path, or trailing slash.

### MongoDB health check times out

Check:

- Atlas cluster is running.
- The database user password is correct.
- Your current IP is allowed in Atlas **Network Access**.
- The user has read/write permissions.
- Special password characters are URL-encoded.

### Data appears to reset

The frontend treats API results as the source of truth, so bundled demo content is not restored after the API has loaded saved data. For redeploy-safe persistence, configure Atlas correctly and confirm `/api/health` returns `database: true`. If MongoDB is unavailable, check that the deployment host preserves `server/data.json` between releases.

### Login session disappears after API restart

Development sessions are held in server memory. Restarting the API invalidates active sessions and users must log in again.

## Security Notes

- Keep `.env` out of version control.
- Rotate any credential that has been pasted into chat, committed, or shared.
- Do not use `0.0.0.0/0` for a production Atlas network rule.
- Use HTTPS and secure cookies in production.
- Set a production `APP_URL` and Discord redirect URL before deployment.
- Use a persistent session store for multi-instance production deployments.
