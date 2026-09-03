# syntax=docker/dockerfile:1.7

FROM node:24.14.1-bookworm-slim AS base

ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 nodeapp \
  && useradd --create-home --uid 1001 --gid nodeapp \
    --shell /usr/sbin/nologin nodeapp

FROM base AS dependencies

COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS builder

COPY . .
RUN npm run db:generate
RUN AUTH_SECRET=container-build-only-auth-secret \
  AUTH_TRUST_HOST=true \
  DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build \
  INSTANCE_BOOTSTRAP_ENABLED=false \
  LAB_INSTANCE_PUBLIC_URL=http://127.0.0.1:3000 \
  LAB_INSTANCE_SLUG=container-build \
  QR_SIGNING_SECRET=container-build-only-qr-secret-00 \
  npm run build

FROM base AS runtime

ENV HOSTNAME=0.0.0.0
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder --chown=nodeapp:nodeapp /app/.next/standalone ./
COPY --from=builder --chown=nodeapp:nodeapp \
  /app/scripts/attendance-close-scheduler.mjs \
  /app/scripts/check-attendance-close-scheduler.mjs \
  ./scripts/

USER nodeapp

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT ?? '3000') + '/api/health/live').then((response) => { if (!response.ok) process.exitCode = 1 }).catch(() => { process.exitCode = 1 })"]

CMD ["node", "server.js"]

FROM dependencies AS operations

ENV NODE_ENV=production

COPY . .
RUN npm run db:generate \
  && chown -R nodeapp:nodeapp /app

USER nodeapp

ENTRYPOINT ["npm", "run"]
