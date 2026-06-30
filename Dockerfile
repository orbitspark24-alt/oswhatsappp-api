# Multi-stage build for the WhatsApp Reseller Console API/worker.
# The CLI ships in the same image (run via: docker compose run --rm api node dist/cli/index.js ...).
#
# The committed prisma/schema.prisma uses provider="sqlite" so local dev/tests need no DB setup.
# For the deployed image we swap the provider to "postgresql" at build time (see sed below) and
# sync the schema with `prisma db push` at startup — no provider-specific migration files needed.

# ---- Build stage ----
FROM node:20-slim AS build
WORKDIR /app

# Prisma needs openssl present to generate/run its engines.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
# Deployed image targets PostgreSQL; local schema stays sqlite for dev/tests.
RUN sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Runtime stage ----
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Prisma client + generated engine, compiled output, the postgres-provider schema, and the
# static admin/portal UI.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY public ./public

EXPOSE 3000

# Sync the DB schema (creates tables on a fresh Postgres), then run the public API
# (which also mounts the Meta webhook routes). Override CMD to run the CLI instead.
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/api/server.js"]
