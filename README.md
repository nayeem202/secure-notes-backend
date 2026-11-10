# Secure Notes Backend

Express REST API for a secure note-taking application, with MongoDB/Mongoose, JWT authentication, bcrypt, role-based access, and a separate vanilla JavaScript frontend.

## Live project

| Resource | URL |
| --- | --- |
| Website | [Secure Notes](https://secure-notes-frontend-rho.vercel.app) |
| Backend API base | `https://secure-notes-backend-delta.vercel.app/api` |
| Interactive API documentation | [Swagger UI](https://secure-notes-backend-delta.vercel.app/docs) |
| OpenAPI document | [openapi.json](https://secure-notes-backend-delta.vercel.app/openapi.json) |
| Public API example | [GET /api/posts](https://secure-notes-backend-delta.vercel.app/api/posts) |
| Database readiness | [GET /health/ready](https://secure-notes-backend-delta.vercel.app/health/ready) |
| Frontend repository | [nayeem202/secure-notes-frontend](https://github.com/nayeem202/secure-notes-frontend) |

The website and API documentation are accessible without a Vercel account. The API base is a prefix: GET `/api` itself is not a route.

## Try the API

1. Open Swagger UI and expand `POST /api/auth/register` to register a unique account, or use `POST /api/auth/login` for an existing account.
2. Click **Try it out**, enter the JSON body, and click **Execute**.
3. Copy `data.accessToken` from the successful response. Click **Authorize** and paste the token without the `Bearer` prefix.
4. Test your private notes and posts. Administration operations require an administrator account.

Swagger UI supplies the write-protection header automatically and keeps authorization in memory. For another API client, send `X-CSRF-Protection: 1` on registration/login and cookie-authenticated writes. Protected requests accept `Authorization: Bearer <accessToken>`. POST/PATCH bodies must use `Content-Type: application/json`.

Reviewer administrator credentials are provided through the private submission email.

## Features and architecture

- Users create, read, update, and delete their own private notes.
- Administrators manage users, use their own notes, and read all users' notes.
- Posts are public to read; only the author can change or delete a post.
- Public posts-by-username lookup exposes only the username, public posts, and pagination.
- Interest grouping uses one aggregate call, with pagination for both groups and member usernames.
- User-post lookup uses one aggregate with a Posts `$lookup`.
- Five explicit indexes are declared with `schema.index()`; query plans are checked in tests.
- Domain rules, application use cases, infrastructure adapters, and HTTP adapters are separated through dependency injection.

See [ARCHITECTURE.md](ARCHITECTURE.md), [REQUIREMENTS.md](REQUIREMENTS.md), and [VERIFICATION.md](VERIFICATION.md).

## Local setup

Use Node.js 24.x and Git. The backend package supports Node.js `>=20.19.0 <25`. Docker instructions require a local Linux-container engine and Docker Compose.

Clone both repositories into the same parent directory:

```bash
git clone https://github.com/nayeem202/secure-notes-backend.git
git clone https://github.com/nayeem202/secure-notes-frontend.git
```

### Windows with Docker Desktop

Start Docker Desktop's Linux engine, then open PowerShell in the backend repository:

```powershell
cd secure-notes-backend
.\start-windows-docker.cmd
```

The launcher prepares an ignored `.env` and private JWT secret if missing, builds the API, starts a MongoDB replica set, initializes indexes, and checks readiness. Existing environment values are preserved.

### Linux with Docker Compose

From the backend repository:

```bash
cd secure-notes-backend
node scripts/setup-local.js
docker compose -f compose.windows.yaml up --build -d --wait
```

The setup script generates the JWT secret before the containers start. Despite its filename, `compose.windows.yaml` also runs with Docker Compose on Linux.

Both Docker paths use their own MongoDB replica set and persistent volume. Compose overrides `MONGODB_URI` with its container database URI; it does not use an Atlas URI from `.env`.

### Start the frontend

In a second terminal:

```bash
cd secure-notes-frontend
npm run dev
```

Use `npm.cmd` in Windows PowerShell if script execution policy blocks `npm.ps1`. The frontend has no package dependencies to install.

Open `http://localhost:5500`. The API is at `http://localhost:3000/api`, and local Swagger UI is at `http://localhost:3000/docs`. Keep these local environment settings:

```dotenv
APP_ORIGIN=http://localhost:5500
API_ORIGIN=http://localhost:3000
SERVE_FRONTEND=false
```

### Run directly against Atlas

To run Node.js on the host with your own Atlas cluster or an existing MongoDB replica set:

```bash
npm ci --include=dev
npm run setup:local
```

Set `MONGODB_URI` in the ignored backend `.env` to your connection string with the `secure_notes` database. Allow your computer's IP in Atlas and use a database account with `readWrite` on that database. Then run:

```bash
npm run db:indexes
npm run db:check
npm run dev
```

`db:check` verifies authentication, ping, topology, collections, and required indexes without modifying data. `db:indexes` creates required indexes and can backfill missing usernames on existing accounts. The application requires transactions, so a standalone MongoDB server is insufficient.

## Administrator setup

Set `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_USERNAME`, and `BOOTSTRAP_ADMIN_PASSWORD` in the backend `.env`. Choose an unused email/username and a password of 6–72 UTF-8 bytes.

For a host process connected to Atlas or another replica set:

```bash
npm run create-admin
```

For the Linux Docker stack, apply the environment and run the command inside the app:

```bash
docker compose -f compose.windows.yaml up -d --force-recreate app
docker compose -f compose.windows.yaml exec app npm run create-admin
```

For the Windows launcher stack:

```powershell
docker --context desktop-linux compose -p secure-notes-windows -f compose.windows.yaml up -d --force-recreate app
docker --context desktop-linux compose -p secure-notes-windows -f compose.windows.yaml exec app npm run create-admin
```

If the launcher uses the local `default` Linux-engine context, replace `desktop-linux` with `default`. The bootstrap command does not reset an existing account's password.

After creation, remove `BOOTSTRAP_ADMIN_PASSWORD` from `.env`. For Docker, repeat the matching `up -d --force-recreate app` command to remove it from the running container environment.

To stop Docker without deleting database data, use the matching command prefix with `stop`:

```bash
docker compose -f compose.windows.yaml stop
```

For the Windows launcher stack, use `docker --context desktop-linux compose -p secure-notes-windows -f compose.windows.yaml stop`.

## Environment

The local template is [.env.example](.env.example). `npm run setup:local` creates the ignored `.env` and generates a missing JWT secret.

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | `development`, `test`, or `production` |
| `HOST` / `PORT` | Host-process defaults: `127.0.0.1` / `3000`; containers bind internally to `0.0.0.0` |
| `APP_ORIGIN` | Exact frontend origin; local template uses `http://localhost:5500` |
| `API_ORIGIN` | Exact backend origin used by Swagger UI and write-origin checks; local default follows `PORT` |
| `SERVE_FRONTEND` | Set `false` for the separate frontend |
| `MONGODB_URI` | MongoDB replica-set or Atlas connection string |
| `JWT_SECRET` | Private random secret of at least 48 characters |
| `JWT_TTL_SECONDS` | Access-token lifetime; default `900` seconds |
| `BCRYPT_ROUNDS` | Password work factor; default `12` |
| `AUTO_INDEX` | `true` for local setup; `false` in production |
| `TRUST_PROXY_HOPS` | Trusted proxy hops; local `0`, current Vercel deployment `1` |
| `API_RATE_LIMIT` | Default `300` requests per minute per instance |
| `AUTH_RATE_LIMIT` | Default `20` auth requests per 15 minutes per instance |
| `QUERY_TIMEOUT_MS` | Database query timeout; default `10000` ms |
| `BOOTSTRAP_ADMIN_*` | One-time administrator setup; optional name defaults to `Administrator` |

Origins must have no path or trailing slash and use HTTPS in production. CORS permits the configured frontend origin; browser writes must come from the configured frontend or backend origin.

## API overview

Paths below are relative to `/api`. Swagger UI includes request schemas, parameters, response schemas, and authentication controls.

| Method | Endpoint | Access |
| --- | --- | --- |
| POST | `/auth/register` | Public; name, unique username, email, password |
| POST | `/auth/login` | Public; either username or email, plus password |
| GET, PATCH | `/auth/me` | Signed in; read/update own profile |
| PATCH | `/auth/password` | Signed in; current and new password |
| POST | `/auth/logout` | Signed in; revokes existing sessions |
| GET, POST | `/notes` | Signed in; own notes |
| GET, PATCH, DELETE | `/notes/:id` | Owner; administrators may read any note |
| GET, POST | `/posts` | Public list; authenticated creation |
| GET, PATCH, DELETE | `/posts/:id` | Public read; author changes |
| GET | `/users/:username/posts` | Public username and posts only |
| GET, POST | `/admin/users` | Administrator |
| GET, PATCH, DELETE | `/admin/users/:id` | Administrator |
| GET | `/admin/notes` | Administrator; optional `owner=<username>` |
| GET | `/admin/analytics/interests` | Administrator; optional exact `interest` filter |

All lists accept `page` and `limit`: defaults 1/10, maximum limit 100, maximum offset 100000. Interest groups additionally accept `memberPage` and `memberLimit` with the same limits. Usernames are 3–30 characters, normalized to lowercase, and unique; duplicates return HTTP 409.

The standalone frontend stores bearer tokens in memory. Reloading it requires signing in again. Logout revokes the account's existing tokens.

## Tests and deployment

```bash
npm ci --include=dev
npm run check
npm test
```

Tests cover application boundaries, authentication, ownership, administrator permissions, transactions, pagination, aggregations, indexes, and the OpenAPI contract. Integration tests start an isolated MongoDB replica set; the first run may download the MongoDB binary. Browser verification results are recorded in [VERIFICATION.md](VERIFICATION.md).

Production runs on Vercel with MongoDB Atlas. [DEPLOYMENT.md](DEPLOYMENT.md) documents environment setup, index migration, public reviewer access, and the submission checklist. `render.yaml` is also supplied for a Docker-based alternative.

The rate limiter uses per-instance memory; enforcing one global limit across multiple instances requires a shared store.
