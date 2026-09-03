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

  docker compose up -d --wait postgres
  trap cleanup EXIT

  docker compose exec -T postgres sh -c \
    'dropdb --if-exists --force -U "$POSTGRES_USER" lab_attendance_test'
  docker compose exec -T postgres sh -c \
    'createdb -U "$POSTGRES_USER" lab_attendance_test'

  local test_database_url
  test_database_url="$(node -e '
    require("dotenv").config({ quiet: true });
    const databaseUrl = new URL(process.env.DATABASE_URL);
    databaseUrl.pathname = "/lab_attendance_test";
    process.stdout.write(databaseUrl.toString());
  ')"

  DATABASE_URL="$test_database_url" npm run db:migrate:deploy
  TEST_DATABASE_URL="$test_database_url" npx vitest run \
    --config vitest.integration.config.mts
}

main "$@"
