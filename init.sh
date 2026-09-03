#!/usr/bin/env bash

set -Eeuo pipefail

readonly PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

fail() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

log_step() {
  printf '\n==> %s\n' "$1"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

main() {
  cd "$PROJECT_ROOT"

  require_command docker
  require_command npm
  docker compose version >/dev/null 2>&1 || fail 'Docker Compose is required.'

  if [[ ! -f .env ]]; then
    log_step 'Creating local environment file'
    cp .env.example .env
  fi

  log_step 'Installing dependencies'
  npm install

  docker compose config >/dev/null

  log_step 'Starting PostgreSQL'
  docker compose up -d --wait postgres

  log_step 'Generating Prisma client'
  npm run db:generate

  log_step 'Applying database migrations'
  npm run db:migrate:deploy

  log_step 'Starting development server'
  exec npm run dev
}

main "$@"
