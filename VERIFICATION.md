# Verification record

Verified on 2026-11-10 in the supplied Linux workspace and the live Vercel production deployment.

## Production

| Item | Result |
| --- | --- |
| Frontend | [Secure Notes](https://secure-notes-frontend-rho.vercel.app) |
| Interactive API documentation | [Swagger UI](https://secure-notes-backend-delta.vercel.app/docs) |
| OpenAPI contract | [openapi.json](https://secure-notes-backend-delta.vercel.app/openapi.json), OpenAPI 3.1, 26 operations |
| API base | `https://secure-notes-backend-delta.vercel.app/api`; use `/api/posts` for a public read |
| Readiness | [Backend readiness](https://secure-notes-backend-delta.vercel.app/health/ready) returns HTTP 200 and `{"status":"ready"}` in the final checks |
| Hosting target | `secure-note-team`, production |
| Backend runtime | Node.js 24.x, Mumbai (`bom1`), 30-second maximum request duration |
| Backend deployed source | `903cbfc94014da0793950c6c6b90f2d0a45e5423` |
| Frontend deployed source | `abc991043d0e4e5145a05928dcc19a4ca9e5c53f` |
| Backend deployment | `dpl_8tJPfJn72s5N3SEyWWTQqQBuXqCg`, READY, promoted |
| Frontend deployment | `dpl_Gk4hoHvkTJHKn16fUQCp8a7L6ELz`, READY, promoted |
| Atlas | `secure_notes`: authentication, ping, replica-set topology, and required indexes passed |
| Anonymous access | Frontend and readiness accessible without a Vercel session or bypass header |
| CORS | Production frontend preflight returned HTTP 204 with the exact allowed origin |
| Private data | Anonymous notes request returned application HTTP 401 |
| Public user lookup | User object contains only `username`; public posts and pagination remain available |
| Browser errors | No page errors during the Swagger and frontend reviewer verification |

The API base is a prefix; GET `/api` itself is not a defined route.

## Frontend flow checked during the refactor

A fresh Chrome session exercised the public frontend, production API, and real Atlas database:

1. Register a temporary user through the browser.
2. Create a private note; verify the stored Atlas record and rendered list.
3. Edit and read the note.
4. Publish a post; verify it in a separate anonymous browser session.
5. Look up posts by username and assert that the public user object has exactly one key, `username`.
6. Sign in as a temporary administrator; verify user listings, filtered private-note read access, and interest groups with member usernames. Other users' notes have no edit action.
7. Sign out and sign in again by username; verify the persisted note.
8. Delete the temporary note and post through the browser.

Both temporary accounts and any remaining test data were removed in an Atlas transaction. Temporary automation bypasses created for staged verification were revoked. Public access was checked again after revocation.

## Interactive API documentation and reviewer access

Swagger UI is hosted by the backend itself at `/docs`, with its specification at `/openapi.json`. Assets are served locally and were compared against source before promoting the staged production build.

A fresh, unauthenticated production browser verified:

1. All 26 operations render under the existing Content Security Policy.
2. Try it out reads public posts and receives HTTP 401 for private notes before login.
3. Registration/login succeed with origin validation and the write-protection header.
4. Authorize accepts the returned JWT.
5. Private-note create/list/update/delete succeeds.
6. A normal user receives HTTP 403 for the administrator user list.
7. Logout sends a JSON body and revokes the token.
8. The dedicated reviewer administrator can list users, all notes, and interest groups through Swagger.
9. The same reviewer credentials open the administrator views in the live frontend.

The temporary Swagger test account and its data were removed. The dedicated reviewer administrator remains available for assessment; credentials are kept in the private submission draft outside both repositories.

Both README files were checked against source and corrected: Linux secret initialization precedes container startup, current API values replace placeholder instructions, local setup covers the supplied launchers and Atlas, and documented automated checks match the package scripts. The frontend README update is commit `6ed6ceae0805fef4129c81fe6391fdca482e24be`; deployed frontend application files are unchanged.

## Architecture, privacy, and pagination

The application and domain layers have no Express, Mongoose, bcrypt, or JWT dependencies. The composition root injects repositories, transactions, passwords, and token adapters. Infrastructure returns plain records and translates database errors; HTTP adapters handle request validation and status mapping.

The dependency-direction test, isolated application tests, and API tests validate these boundaries. Public posts remain readable as required by the interview task. Personal names, emails, interests, roles, and session fields are excluded from the public user response.

Interest groups use exactly one aggregate call, with pagination for both groups and member usernames. Local Chrome checks exercised next/previous member pagination with more members than a single page. The production browser verified the rendered member usernames.

## Atlas indexes

The new compound `users_interests_id` index was created before deployment. After promoting and testing the new backend, the legacy `users_interests` index was retired and `npm run db:check` passed.

The final five explicit application indexes are:

- `users_email_unique`
- `users_username_unique`
- `users_interests_id`
- `notes_owner_id`
- `posts_author_id`

Each collection also retains MongoDB's built-in `_id_` index. Index-set tests and explain-plan checks passed; the interest-member lookup uses `users_interests_id`.

## Local checks

| Check | Result |
| --- | --- |
| Backend test suite | 49 passing tests, including an isolated MongoDB 8.0.18 replica set |
| Backend JavaScript | 69 files passed syntax and relative-import checks |
| Frontend JavaScript | Syntax checks passed |
| Source comments | Zero comments in tracked backend/frontend source and configuration files |
| Public profile privacy | Username-only response asserted in application/API tests and production |
| Transactions | Rollback, session revocation, and account-deletion race tests passed |
| Aggregations | Single aggregate-call assertions, member pagination, and explain plans passed |
| Production dependency audit | `npm audit --omit=dev --audit-level=high`: 0 vulnerabilities |
| Build inputs | No private `.env` files in either deployment upload |
| Native Windows / complete Docker launch | Not exercised by this run |

## Runtime observations

During the earlier refactor rollout, one readiness request returned HTTP 503 after index retirement. Its cause was not established. The next full anonymous-access check passed, followed by twelve successful HTTP 200 requests alternating readiness and public posts. The recorded production browser flow passed without application failures.

Runtime logs contained Node's `DEP0169` deprecation warning for `url.parse()`. No warning suppression was added. The previous Mongoose legacy update-option warning was addressed by using `returnDocument: 'after'`.

Secrets remain in Vercel Secret environment variables and the ignored local backend environment file. The production JWT secret is independent of the local development secret. No credentials, authentication state, or temporary browser artifacts are committed.

The request limiter is per backend function instance; global enforcement across scaled instances would require a shared store.

[Architecture](ARCHITECTURE.md), [requirement mapping](REQUIREMENTS.md), and [deployment instructions](DEPLOYMENT.md) provide the review and submission details. Later documentation-only commits do not change the deployed application code identified above.
