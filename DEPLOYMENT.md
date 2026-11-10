# Submission deployment

## Repositories

- Frontend: https://github.com/nayeem202/secure-notes-frontend
- Backend: https://github.com/nayeem202/secure-notes-backend

Deploy these as separate projects. Push reviewed local changes before using Git-based deployment.

## Vercel backend

Use Framework Preset **Other** and Node.js 24. The included `vercel.json` deploys `api/index.js` and forwards API and health routes to it. Set these production variables before deployment:

| Variable           | Value                                                                        |
| ------------------ | ---------------------------------------------------------------------------- |
| `NODE_ENV`         | `production`                                                                 |
| `MONGODB_URI`      | Actual Atlas URI with `/secure_notes` as the database                        |
| `JWT_SECRET`       | Private random secret of at least 48 characters                              |
| `APP_ORIGIN`       | Exact HTTPS frontend production origin, without a trailing slash             |
| `API_ORIGIN`       | Exact HTTPS backend production origin for Swagger UI and write-origin checks |
| `SERVE_FRONTEND`   | `false`                                                                      |
| `AUTO_INDEX`       | `false`                                                                      |
| `TRUST_PROXY_HOPS` | `1`                                                                          |

Store credentials as sensitive/encrypted Vercel variables, never in frontend files. Run `npm run db:indexes` against Atlas once, then `npm run db:check`. Required indexes must exist before serving traffic.

Atlas Network Access must permit backend egress. Your computer's `/32` entry does not permit Vercel egress. Configure access according to your hosting/network policy. If using `0.0.0.0/0` for a temporary assessment, it permits connection attempts from any IP; database authentication remains required. Use a dedicated user restricted to `readWrite` on `secure_notes`.

The in-memory limiter is per function instance. A shared limiter store is needed for a global rate limit across scaled instances.

## Vercel frontend

Use Framework Preset **Other**. The included `vercel.json` serves the static site without a build. The production value in `config.js` already points to the current backend. Change that value only when using a different backend HTTPS URL ending in `/api`. Keep backend `APP_ORIGIN` aligned with the frontend production domain.

## Reviewer verification

1. Open the frontend production URL in a private browser window without a Vercel session. It must load without a Vercel authentication gate.
2. Open backend `/health/ready`. Expect HTTP 200 and `{"status":"ready"}`. Open `/docs` to test operations interactively; `/openapi.json` is the machine-readable contract.
3. Register, create/edit/delete a note, publish a post, sign out, and sign in again. Confirm persistence and no CORS failures.
4. If admin access is required, create a separate admin using `npm run create-admin`; share credentials only in the requested submission channel.
5. Run both projects locally before the interview. Local commands are in each README.

## Email submission

Reply All to the exact original email thread within two days of receiving it. Include:

- Frontend GitHub repository link
- Backend GitHub repository link
- Live frontend production website URL
- Live backend API base URL ending in `/api`
- Swagger UI URL ending in `/docs`
- Dedicated reviewer administrator username/password, shared privately in the email

Submit only after live checks pass; do not include placeholder URLs.

## Interest-index upgrade

Create the new `users_interests_id` compound index with `npm run db:indexes` before deploying the updated backend. Keep the old `users_interests` index during the rollout so the previous deployment can still start.

After promoting and verifying the updated backend, run:

```bash
npm run db:indexes -- --retire-legacy-interest-index
```

This checks the replacement's key before removing only the known legacy index. Final application index count remains five; the compound prefix serves the previous interest-filter queries.
