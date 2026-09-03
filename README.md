# Lab Attendance

A multi-instance laboratory attendance application. Each deployment represents
one lab and shares a PostgreSQL database with other deployments while preserving
tenant isolation.

## Local Bootstrap

Requirements:

- Node.js 24 or newer
- npm 11 or newer
- Docker with Docker Compose

Run:

```bash
./init.sh
```

The script creates `.env` from `.env.example` when needed, installs dependencies,
starts the local PostgreSQL container, generates the Prisma client, applies
existing migrations, registers the configured lab and bootstrap administrator,
and starts the Next.js development server. Existing PostgreSQL data is
preserved.

After the first successful registration, set
`INSTANCE_BOOTSTRAP_ENABLED=false`. The initial password may remain in the
server-only environment as an operational reference, but bootstrap uses it only
when creating a missing account. Later startups never reset an existing user's
password.

## Local Authentication

Authentication uses local email and password credentials with Argon2id hashes
and Auth.js JWT sessions. Each session is bound to the configured lab. Protected
pages re-read the active account and current-lab authorization from PostgreSQL.
The direct `/auth/signin` panel accepts only global administrators and active
local managers. After scanning a valid QR, attendees authenticate through the
separate, restricted `/scan/signin` page.

The attendee landing page at `/attendance` explains the QR-first flow and shows
the active attendee account when one exists. During QR confirmation, an attendee
can switch accounts without losing the current pending QR credential.

Set a unique, random `AUTH_SECRET` of at least 32 characters for every production
environment. `AUTH_TRUST_HOST=true` is required because Auth.js builds callback
URLs from the host forwarded by the trusted deployment proxy.

The global administrator signs in at `/auth/signin` and is redirected to the
current instance's `/admin` landing page. The account has global authority but
does not occupy a lab membership.

The administrator dashboard allows the signed-in account to change its password.
Password changes increment the account's session version, invalidate previously
issued sessions, and require a new sign-in. The original environment password is
not reapplied after the account exists.

The global administrator can create 72-hour, single-use invitation links for
attendees and local lab managers from `/admin/users` and `/admin/managers`.
Invitation tokens are displayed only when created and are stored in PostgreSQL
only as hashes. Existing global accounts keep their profile and password when
joining another lab. Access can be activated or deactivated without deleting its
history, and pending invitations can be revoked.

Active local managers sign in through the same credentials page and land on
`/manager`. Their dashboard and `/manager/users` are limited to the configured
lab. Managers can invite attendees, review pending invitations, and activate or
deactivate attendee memberships; they cannot create managers or target another
lab.

The manager attendance view at `/manager/attendance` shows open visits, all
registered attendee memberships, and paginated visit history for the configured
lab. Managers configure one daily operating interval and can record an explicit
manual entry or exit. Entry is available only while the lab is open; exit remains
available for an existing visit. History identifies QR, manager, and system
transitions.

Managers authorize public QR displays from `/manager/displays`. A display uses a
single-use, 10-minute activation code to obtain a revocable 12-hour capability
at `/display`; it never receives a user or administrator session. Its signed,
lab-bound QR rotates every 60 seconds.

Attendees scan the displayed QR to open `/scan`, sign in when needed, and confirm
their server-timestamped entry or exit. The validated QR is exchanged for a
five-minute, HTTP-only pending credential. The displayed QR itself continues to
rotate every 60 seconds. Consumption is transactional and
idempotent, so submitting the same QR window again returns the original result
instead of reversing attendance.

Attendance operating hours use the lab's configured IANA timezone and a
half-open interval: opening is inclusive and closing is exclusive. New entries
are rejected outside that interval. Open visits are closed at the configured
boundary with the `SYSTEM` method; attendance reads and writes reconcile any
missed closure defensively. If a daylight-saving transition makes a configured
wall-clock interval invalid on that date, entry fails closed.

For closure to be persisted while the application is otherwise idle, configure
a distinct `ATTENDANCE_CRON_SECRET` for each deployment and schedule an external
request at least once per minute:

```text
POST /api/cron/attendance/close
Authorization: Bearer <ATTENDANCE_CRON_SECRET>
```

The endpoint accepts no tenant or timestamp input. It resolves only the lab in
`LAB_INSTANCE_SLUG`, uses server time, and is safe to retry. An authorized QR
display also reconciles attendance whenever it refreshes. The cron request also
removes old rate-limit buckets for the configured lab.

Each successful cron request records a tenant-scoped heartbeat. Operational
probes are available at `/api/health/live`, `/api/health/ready`, and
`/api/health/attendance-close`; the last endpoint becomes unhealthy after three
minutes without a successful automatic-close run. The production container
topology includes a scheduler that invokes the canonical HTTPS endpoint every
60 seconds without following redirects or logging its bearer credential.

## Rate Limiting

Sensitive unauthenticated and attendance mutations use atomic, fixed-window
limits stored in PostgreSQL. Every bucket is scoped to the trusted current lab.
Email addresses, invitation tokens, and user identifiers are represented only by
domain-separated HMAC hashes derived with `AUTH_SECRET`; raw subjects are not
stored. If the limiter is unavailable, the affected operation fails closed.

The current limits are:

- Credential verification: 120 attempts per lab per minute and 10 attempts per
  normalized email address every 15 minutes
- Invitation acceptance: 60 attempts per lab every 10 minutes and 5 attempts
  per invitation token every 15 minutes
- QR exchange: 300 attempts per lab per minute
- Attendance confirmation: 10 attempts per attendee every 5 minutes
- Display activation: 10 attempts per lab every 10 minutes

IP-based limits are intentionally disabled until the deployment has an explicit
trusted-proxy configuration.

Security-sensitive outcomes are written as newline-delimited JSON to standard
output. The allowlisted schema excludes names, email addresses, credentials,
cookies, URLs, request bodies, token values and hashes, session values, IP
addresses, and exception details. Production operators must provide restricted,
durable log retention.

All application routes receive CSP, HSTS, permissions, frame, content-type,
cross-origin, and referrer headers. The selected headers-only ingress policy
still requires a trusted HTTPS reverse proxy and does not enforce canonical
forwarded headers inside the application.

## Commands

```bash
npm run dev
npm run format:check
npm run lint
npm test
npm run test:integration
npm run test:e2e
npm run build
npm run db:generate
npm run db:bootstrap
npm run db:migrate:create
npm run db:migrate:deploy
npm run db:migrate:status
npm run db:studio
```

The E2E command creates and destroys only the loopback
`lab_attendance_e2e` database, builds the production application, and runs one
Chromium worker through real Auth.js, invitation, and mobile QR flows. Install
the browser once with `npx playwright install chromium`; CI Linux images may
also require `npx playwright install --with-deps chromium`.

## Production Containers

`Dockerfile` provides separate non-root `runtime` and `operations` targets.
`compose.production.yml` runs instance validation, the application, and one
attendance-close scheduler without bundling PostgreSQL or running migrations at
application startup. Migration and bootstrap commands remain explicit profiles.

See [the container deployment runbook](docs/operations/container-deployment.md)
for HTTPS ingress requirements, immutable image usage, one-time shared database
migrations, first-start bootstrap, probes, audit-log handling, backup and restore,
shutdown, and rollback procedures.

To stop local PostgreSQL without deleting its data:

```bash
docker compose down
```

Deleting the volume is destructive and must be explicit:

```bash
docker compose down -v
```
