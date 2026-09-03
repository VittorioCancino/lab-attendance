#!/usr/bin/env bash

set -Eeuo pipefail

readonly PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cleanup() {
  docker compose exec -T postgres sh -c \
    'dropdb --if-exists --force -U "$POSTGRES_USER" lab_attendance_test' \
    >/dev/null 2>&1 || true
}

main() {
  cd "$PROJECT_ROOT"

  local test_database_url
  test_database_url="$(node -e '
    require("dotenv").config({ quiet: true });
    const databaseUrl = new URL(process.env.DATABASE_URL);
    databaseUrl.pathname = "/lab_attendance_test";
    if (!["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname)) {
      throw new Error("Integration tests require a loopback PostgreSQL host.");
    }
    process.stdout.write(databaseUrl.toString());
  ')"

  docker compose up -d --wait postgres
  trap cleanup EXIT

  docker compose exec -T postgres sh -c \
    'dropdb --if-exists --force -U "$POSTGRES_USER" lab_attendance_test'
  docker compose exec -T postgres sh -c \
    'createdb -U "$POSTGRES_USER" lab_attendance_test'

  DATABASE_URL="$test_database_url" npm run db:migrate:deploy
  TEST_DATABASE_URL="$test_database_url" npx vitest run \
    --config vitest.integration.config.mts
}

main "$@"
