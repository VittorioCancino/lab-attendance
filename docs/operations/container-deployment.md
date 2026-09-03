# Platform-Neutral Container Deployment

This topology runs one application instance and one attendance-close scheduler
for exactly one lab. PostgreSQL is external because every lab deployment shares
one database and one migration history.

## Required Infrastructure

- A container host with Docker Engine and Compose v2, or an orchestrator capable
  of expressing the same services and health checks
- A PostgreSQL 17-compatible shared database with encrypted transport
- A reverse proxy or ingress that terminates HTTPS before the application
- A restricted container-log sink with retention and access controls
- Encrypted database-backup storage outside the application host

The reverse proxy must keep the application port private, preserve the canonical
`Host`, replace `X-Forwarded-Proto` with `https`, and never forward client-supplied
forwarding headers unchanged. This application trusts the deployment proxy
through `AUTH_TRUST_HOST=true`; the selected headers-only policy does not reject
malformed forwarded-host or forwarded-protocol values inside the application.

## Environment File

Create `.env.production` with mode `0600`. Start from `.env.example`, remove the
local PostgreSQL variables, and set production values for every server variable.
The following secrets must be independently generated values:

- `AUTH_SECRET`
- `QR_SIGNING_SECRET`
- `ATTENDANCE_CRON_SECRET`
- `LAB_BOOTSTRAP_ADMIN_INITIAL_PASSWORD` during initial bootstrap only

Set `LAB_INSTANCE_PUBLIC_URL` to the canonical HTTPS origin routed by the reverse
proxy. Keep `INSTANCE_BOOTSTRAP_ENABLED=false` for normal operation. Never bake
the environment file into either container image.

Create `.env.scheduler.production` with mode `0600` from
`.env.scheduler.example`. It contains only `LAB_INSTANCE_PUBLIC_URL` and
`ATTENDANCE_CRON_SECRET`, preventing the scheduler from receiving database,
authentication, QR-signing, or bootstrap credentials. Set
`LAB_ATTENDANCE_SCHEDULER_ENV_FILE` if the file is stored elsewhere.

## Build

Build immutable runtime and operations images from the same source revision:

```bash
docker build --target runtime -t registry.example/lab-attendance:<version> .
docker build --target operations -t registry.example/lab-attendance-ops:<version> .
```

Set `LAB_ATTENDANCE_IMAGE` and `LAB_ATTENDANCE_OPERATIONS_IMAGE` to those exact
tags or, preferably, immutable digests. Review and regularly update the pinned
Node.js base-image patch release.

## Database Migration

Back up the entire shared database before migration. Per-lab dumps are not a
complete recovery mechanism because users and migration history are global.

Check and deploy migrations exactly once for the shared database, not once per
lab instance:

```bash
docker compose -f compose.production.yml --profile operations run --rm migration-status
docker compose -f compose.production.yml --profile operations run --rm migrate
```

Review every generated SQL migration before deployment. Do not start all lab
instances with automatic migration commands.

## Initial Bootstrap

For a missing lab, set the approved bootstrap metadata and temporary initial
administrator password, then run:

```bash
docker compose -f compose.production.yml --profile bootstrap run --rm instance-bootstrap
```

After success, set `INSTANCE_BOOTSTRAP_ENABLED=false` and remove
`LAB_BOOTSTRAP_ADMIN_INITIAL_PASSWORD`. A normal startup validates existing
instance state and never resets credentials.

## Start And Verify

Start the instance and its scheduler:

```bash
docker compose -f compose.production.yml up -d app attendance-close-scheduler
docker compose -f compose.production.yml ps
```

Verify these endpoints through the expected network boundary:

- `/api/health/live` returns 200 when the Node.js process can serve requests.
- `/api/health/ready` returns 200 only when configuration, PostgreSQL, schema,
  current lab, and cron secret are available.
- `/api/health/attendance-close` returns 200 only when the last successful
  automatic closure is no more than 180 seconds old.

The scheduler calls the canonical HTTPS origin immediately and every 60 seconds,
uses a 10-second timeout, rejects redirects, and never logs its URL, bearer
secret, headers, or response body. Its container health check uses a private
success marker under `/tmp`.

Alert on application unready status, scheduler container failures, stale
attendance-close status, repeated `ATTENDANCE_CRON` failures, and repeated
`AUTH_LIBRARY` failures.

## Audit Logs

Security audit events are newline-delimited JSON on standard output. They contain
allowlisted event names, outcomes, reason codes, roles/actions, and database UUIDs
only. Treat the UUIDs as restricted identifiers.

Configure the platform log sink to retain the required audit period, restrict
access, encrypt storage, and prevent application operators from silently
rewriting retained logs. Define retention according to institutional policy
before production use.

Proxy access logs must replace `/invite/<token>` with `/invite/:token`. Suppress
query strings, authorization headers, cookies, request and response bodies, and
all QR or invitation capabilities. Application audit logs never include names,
email addresses, passwords, password hashes, token values, token hashes, session
values, cookies, IP addresses, full URLs, exception messages, or stack traces.

## Backup And Restore

Define and approve the recovery-point objective, recovery-time objective,
retention period, encryption location, and restore-test cadence before launch.
Create a database-wide custom-format backup with a PostgreSQL client version
compatible with the server:

```bash
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-acl --file=lab-attendance.dump
```

Encrypt and transfer the dump off-host immediately. Test restoration regularly
into an isolated database, run `npm run db:migrate:status` against it, and execute
the integration smoke checks. Never test restoration over the live database.

## Shutdown And Rollback

Stop the scheduler before the application and allow the configured termination
grace periods:

```bash
docker compose -f compose.production.yml stop attendance-close-scheduler
docker compose -f compose.production.yml stop app
```

Roll back by restoring the previous immutable application image while retaining
the reviewed database migration history. Prefer forward-fix migrations; never
perform an ad hoc destructive schema rollback. Confirm that the older application
version is compatible with already-applied migrations before changing the image.

## Release Validation

Before promoting an image, run:

```bash
npm run format:check
npm run lint
npm test
npm run test:integration
npm run test:e2e
docker compose -f compose.production.yml config
```

Also build both image targets, run the runtime image as a non-root user, verify
read-only filesystem operation and graceful `SIGTERM`, and inspect the final
image to confirm that no `.env` file or test artifact is present.
