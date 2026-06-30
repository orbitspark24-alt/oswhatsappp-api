# Multi-stage build for the WhatsApp Reseller Console API/worker.
# The CLI ships in the same image (run via: docker compose run --rm api node dist/cli/index.js ...).

# ---- Build stage ----
FROM node:20-slim AS build
WORKDIR /app

# Prisma needs openssl present to generate/run its engines.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
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

# Prisma client + generated engine, compiled output, and schema for migrations.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/dist ./dist
COPY prisma ./prisma

EXPOSE 3000

# Apply DB migrations, then run the public API (which also mounts the Meta webhook routes).
# Override the command to run the CLI or the standalone webhook server.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/api/server.js"]
