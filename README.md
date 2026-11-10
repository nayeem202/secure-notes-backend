# Secure Notes Backend

## Live deployment

- Frontend: [https://secure-notes-frontend-rho.vercel.app](https://secure-notes-frontend-rho.vercel.app)
- API: [https://secure-notes-backend-delta.vercel.app/api](https://secure-notes-backend-delta.vercel.app/api)
- Database readiness: [https://secure-notes-backend-delta.vercel.app/health/ready](https://secure-notes-backend-delta.vercel.app/health/ready)
- Frontend repository: https://github.com/nayeem202/secure-notes-frontend
- Backend repository: https://github.com/nayeem202/secure-notes-backend

The production URLs are public and do not require a Vercel account. Register through the website to use private notes. Admin setup is documented in the backend README.


Standalone Express REST API for Secure Notes. This is the backend project and GitHub repository; the independent static frontend is in `secure-notes-frontend`.

## Stack and structure

- Node.js 20.19 through 24.x (production: 24.x), Express 5, MongoDB, and Mongoose
- JWT authentication with bcrypt password hashing
- Routes, controllers, validation, middleware, services, models, and configuration are kept in separate `src/` modules
- MongoDB transactions require a replica set; the supplied Docker Compose setup initializes one
- `SERVE_FRONTEND=false` keeps this project API-only

## Run locally on Windows

1. Install Node.js 24 LTS and Docker Desktop with its Linux engine.
2. Open PowerShell in `D:\secure-notes-backend` and start the backend:

```powershell
.\start-windows-docker.cmd
```

The launcher creates a private `.env` if missing, builds the API and MongoDB containers, runs the username migration and required index setup, and checks `http://localhost:3000/health/ready`.

3. Open a second PowerShell window and start the standalone frontend:

```powershell
cd D:\secure-notes-frontend
npm.cmd run dev
```

4. Open `http://localhost:5500`. The frontend calls the backend at `http://localhost:3000/api`.

The backend `.env` defaults to `APP_ORIGIN=http://localhost:5500` and `SERVE_FRONTEND=false`. Do not change the origin unless the frontend's local or deployed origin changes.

To stop the containers without deleting data:

```powershell
& "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin\docker.exe" --context desktop-linux compose -p secure-notes-windows -f .\compose.windows.yaml stop
```

## Run locally on Linux

Install Node.js 24 LTS and Docker Engine with the Compose plugin. From this directory, copy `.env.example` to `.env`, generate a JWT secret, then start the backend:

```bash
cp .env.example .env
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
docker compose -f compose.windows.yaml up --build -d --wait
```

Set the generated value as `JWT_SECRET` in `.env`. In a second terminal, run `npm run dev` from `secure-notes-frontend`, then open `http://localhost:5500`.

## Admin account

Set `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_USERNAME`, and `BOOTSTRAP_ADMIN_PASSWORD` in `.env`, then apply the app environment and create the account:

```powershell
& "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin\docker.exe" --context desktop-linux compose -p secure-notes-windows -f .\compose.windows.yaml up -d app
& "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin\docker.exe" --context desktop-linux compose -p secure-notes-windows -f .\compose.windows.yaml exec app npm run create-admin
```

Use an unused email and username. The password must be at least 6 characters and at most 72 UTF-8 bytes. Remove the bootstrap password from `.env` after creation. The bootstrap script does not reset existing account passwords.

## Environment

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | `development`, `test`, or `production` |
| `HOST` / `PORT` | API bind address and port; defaults `127.0.0.1` and `3000` |
| `APP_ORIGIN` | Exact frontend origin allowed by CORS and mutation checks; local default `http://localhost:5500` |
| `SERVE_FRONTEND` | `false` for this API-only project |
| `MONGODB_URI` | MongoDB replica set URI |
| `JWT_SECRET` | Random secret with at least 48 characters |
| `JWT_TTL_SECONDS` | Access token lifetime; default `900` |
| `BCRYPT_ROUNDS` | bcrypt work factor; default `12` |
| `AUTO_INDEX` | Development index setup; disable in production |
| `BOOTSTRAP_ADMIN_EMAIL` | One-time administrator setup |
| `BOOTSTRAP_ADMIN_USERNAME` | Unique administrator username |
| `BOOTSTRAP_ADMIN_PASSWORD` | One-time administrator setup; remove after use |

## API overview

Base URL: `http://localhost:3000/api`.

| Method | Endpoint | Access |
| --- | --- | --- |
| POST | `/auth/register` | Public; requires `name`, unique `username`, `email`, `password` |
| POST | `/auth/login` | Public; accepts either `username` or `email` with `password` |
| GET | `/auth/me` | Signed in |
| PATCH | `/auth/me` | Signed in; update name, username, or interests |
| PATCH | `/auth/password` | Signed in |
| POST | `/auth/logout` | Signed in |
| GET, POST | `/notes` | Signed in; own notes |
| GET, PATCH, DELETE | `/notes/:id` | Owner; admins may read any note |
| GET, POST | `/posts` | Public list; signed-in post creation |
| GET, PATCH, DELETE | `/posts/:id` | Public read; author write access |
| GET | `/users/:username/posts` | Public; one aggregation pipeline with `$lookup` |
| GET, POST | `/admin/users` | Admin; paginated list and user creation |
| GET, PATCH, DELETE | `/admin/users/:id` | Admin |
| GET | `/admin/notes` | Admin; paginated, optional `owner=<username>` |
| GET | `/admin/analytics/interests` | Admin; paginated interest groups |

Every list endpoint accepts `page` and `limit`; default page is 1, default limit is 10, and maximum limit is 100. Usernames are 3–30 characters, normalized to lowercase, and unique. Duplicate usernames return HTTP 409.

The frontend uses the short-lived access token in an `Authorization: Bearer` header. Tokens stay in memory and are not written to browser storage; a separately hosted frontend asks the user to sign in again after a reload. CORS and write-origin validation allow only the exact `APP_ORIGIN`.

## Tests and checks

```powershell
npm.cmd ci --include=dev
npm.cmd run check
npm.cmd test
```

The integration suite uses an isolated in-memory MongoDB replica set. The browser suite belongs to the separate frontend project and is not part of this backend package.

## Check MongoDB Atlas

Run `npm run setup:local` to prepare the ignored backend `.env` and a private JWT secret. Set `MONGODB_URI` to the URI copied from your Atlas cluster, including the `secure_notes` database name, then run `npm run db:check`.

The check verifies authentication, ping, replica-set/sharded topology, and required indexes without changing data. On a fresh database, review and run `npm run db:indexes` once, then repeat the check. Index setup can backfill usernames on existing accounts.

The Atlas database user needs `readWrite` on `secure_notes`. Network access must permit the deployed backend. Reviewers access the frontend/API; their IP addresses do not need to be added to Atlas. The Windows helper contains seed addresses for the originally configured cluster; use your own cluster's Atlas connection string if it differs.

## Deploy on Vercel

See [DEPLOYMENT.md](DEPLOYMENT.md). The `api/index.js` entrypoint reuses the MongoDB pool across warm invocations. `vercel.json` routes API and health URLs to it. `npm start` continues to use the standalone server locally or on Render.

## Deploy backend

This repository includes `render.yaml` for a free Docker Web Service with `/health/ready` health checks. Create a MongoDB Atlas Free cluster and database user first and add your computer's current public IP to the Atlas IP access list. Then run the Windows helper from PowerShell. It securely prompts only for the database password, builds the standard `mongodb://` seed-list URI (avoiding blocked SRV DNS lookups), writes it to the ignored local `.env`, installs dependencies, and initializes the required indexes:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-atlas-windows.ps1
```

The index command also backfills usernames for existing accounts. The application requires these indexes at startup and runs with `AUTO_INDEX=false` in production. Render Free does not provide a pre-deploy command, so run this once from your computer. After creating the Render service, add its outbound IP ranges from the service's Outbound tab to the Atlas IP access list. Keep only the required trusted ranges; remove your temporary computer IP afterward if you do not need local database access.

Set Render's `MONGODB_URI` to the Atlas URI and `APP_ORIGIN` to the exact Netlify site origin, such as `https://example.netlify.app`, with no trailing slash. `render.yaml` generates `JWT_SECRET` automatically and trusts one Render proxy hop for client IP handling. Never commit `.env` or share either secret.

The default rate limiter uses process memory. Configure a shared rate-limit store before running multiple backend instances.

Deploy the frontend separately from the `secure-notes-frontend` project. Set its `config.js` API base URL to this backend's public `/api` URL, then set this backend's `APP_ORIGIN` to the exact deployed frontend origin.
