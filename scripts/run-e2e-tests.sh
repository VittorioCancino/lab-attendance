#!/usr/bin/env bash

set -Eeuo pipefail

readonly PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

cleanup() {
  docker compose exec -T postgres sh -c \
    'dropdb --if-exists --force -U "$POSTGRES_USER" lab_attendance_e2e' \
    >/dev/null 2>&1 || true
}

main() {
  cd "$PROJECT_ROOT"

  docker compose up -d --wait postgres
  trap cleanup EXIT

  docker compose exec -T postgres sh -c \
    'dropdb --if-exists --force -U "$POSTGRES_USER" lab_attendance_e2e'
  docker compose exec -T postgres sh -c \
    'createdb -U "$POSTGRES_USER" lab_attendance_e2e'

  local e2e_database_url
  e2e_database_url="$(node -e '
    require("dotenv").config({ quiet: true });
    const databaseUrl = new URL(process.env.DATABASE_URL);
    databaseUrl.pathname = "/lab_attendance_e2e";
    if (!["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname)) {
      throw new Error("E2E tests require a loopback PostgreSQL host.");
    }
    process.stdout.write(databaseUrl.toString());
  ')"

  export ATTENDANCE_CRON_SECRET='e2e-cron-secret-with-at-least-32-characters'
  export AUTH_SECRET='e2e-auth-secret-with-at-least-32-characters'
  export AUTH_TRUST_HOST='true'
  export DATABASE_URL="$e2e_database_url"
  export INSTANCE_BOOTSTRAP_ENABLED='false'
  export LAB_INSTANCE_PUBLIC_URL='http://127.0.0.1:3101'
  export LAB_INSTANCE_SLUG='e2e-lab'
  export NEXT_TELEMETRY_DISABLED='1'
  export QR_SIGNING_SECRET='e2e-qr-secret-with-at-least-32-characters'

  if [[ -e /etc/NIXOS ]] &&
    [[ -z "${PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:-}" ]] &&
    command -v chromium >/dev/null 2>&1; then
    PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="$(command -v chromium)"
    export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  fi

  npm run db:migrate:deploy
  npm run build
  npx tsx tests/e2e/seed.ts
  npx playwright test
}

main "$@"
