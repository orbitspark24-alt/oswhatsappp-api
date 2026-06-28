# WhatsApp API Reseller Console Platform

A console-driven platform for provisioning, metering, and billing **WhatsApp Business API (Meta Cloud API)** accounts for end-clients on a monthly subscription, with a public REST API for a future CRM to plug into.

## Status

✅ All 8 build steps complete. Provisioning, billing, messaging, templates, webhooks, the public REST API, the event bus / outbound CRM webhooks, broadcasts, analytics, tests, and Docker packaging are in place. The WhatsApp Cloud API adapter has been verified live against a real Meta test number.

## Stack

- **Language/runtime**: Node.js + TypeScript
- **CLI**: `commander` (+ `inquirer` for interactive prompts, `cli-table3` / `chalk` for output)
- **API**: `Fastify` + `@fastify/swagger` (OpenAPI spec auto-generated)
- **ORM / DB**: `Prisma` — SQLite for local dev, PostgreSQL for production
- **Queue** (bulk/broadcast, step 7): `BullMQ` + Redis
- **WhatsApp integration**: Meta **WhatsApp Cloud API** only (official, ToS-compliant). No unofficial scraping libraries.

## Why Cloud API only

WhatsApp access for a resale business must go through Meta's official Cloud API with a registered WABA + phone number per client, onboarded via Embedded Signup / Tech Provider flow. Unofficial libraries (Baileys, whatsapp-web.js, etc.) violate WhatsApp's ToS and get numbers banned — they are not viable for paying clients and are intentionally excluded from this codebase.

The WhatsApp integration is abstracted behind a `WhatsAppProvider` interface (`src/providers/whatsapp/`) so additional BSPs can be added later without touching business logic.

## Directory structure

```
.
├── prisma/
│   ├── schema.prisma       # DB schema (see below)
│   └── seed.ts             # demo admin, plans, mock client (added in step 4)
├── src/
│   ├── cli/                # commander entrypoint + command groups
│   │   ├── index.ts
│   │   └── commands/       # client, account, billing, message, template, webhook, analytics, system
│   ├── api/                # Fastify app: routes, middleware, OpenAPI
│   ├── services/           # business logic — shared by CLI and API
│   ├── providers/
│   │   ├── whatsapp/       # WhatsAppProvider interface, CloudApiProvider, MockProvider
│   │   ├── payment/        # PaymentProvider interface, ManualPaymentProvider
│   │   └── notification/   # NotificationProvider interface
│   ├── modules/            # plugin/tool registry (Tool interface, self-registration)
│   ├── events/             # in-process event bus (message.sent, invoice.created, ...)
│   ├── repositories/       # Prisma-backed data access
│   ├── db/                 # Prisma client singleton
│   ├── config/             # env-driven config (no secrets/plans hardcoded)
│   ├── lib/                # crypto (AES-256-GCM), logger, audit helper
│   └── types/
├── docker/
├── .env.example
├── package.json
└── tsconfig.json
```

## Database schema

Defined in [`prisma/schema.prisma`](prisma/schema.prisma). Entities:

| Model | Purpose |
|---|---|
| `Admin` | Platform operator accounts, audit log owner |
| `Client` | Reseller's end-customer |
| `WhatsAppAccount` | A provisioned WABA + phone number belonging to a client; holds **encrypted** access token, webhook verify token, app secret |
| `Plan` | Subscription tier: price, message quota, rate limit, max WhatsApp accounts, feature flags (JSON) |
| `Subscription` | Client ↔ Plan ↔ (optional) WhatsAppAccount, with status/renewal date |
| `Invoice` | Monthly billing document per subscription/cycle |
| `Payment` | Payment attempts/records against an invoice (manual today, Stripe/Razorpay-ready) |
| `UsageRecord` | Per-account, per-cycle message counters for quota enforcement |
| `Message` | Conversation log (inbound + outbound), linked to templates when applicable |
| `Template` | WhatsApp message templates and their Meta approval status |
| `Contact` | Per-client audience list with opt-in/opt-out tracking |
| `ApiKey` | Per-client public API credentials (hashed, scoped, revocable) |
| `WebhookEndpoint` | Client's CRM callback URL + signing secret for outbound events |
| `AuditLog` | Every admin/API-key action, for accountability |

Secrets (`*Encrypted` columns) are ciphertext produced by `src/lib/crypto.ts` (AES-256-GCM, key from `ENCRYPTION_KEY` env var) — never stored or logged in plaintext.

## Setup

```bash
npm install
cp .env.example .env
# generate an encryption key and paste into .env as ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

npx prisma migrate dev --name init
npm run prisma:seed   # demo admin, plans, mock client (step 4+)
```

## Running the CLI

```bash
npm run cli -- --help
npm run cli -- client create --name "Acme Corp" --email ops@acme.com
npm run cli -- account provision --client <clientId> --waba-id <id> --phone-number-id <id> --access-token <token>
```

## Running the API

```bash
npm run dev:api
# OpenAPI/Swagger UI: http://localhost:3000/docs
```

## How the future CRM connects

The CRM authenticates with a per-client API key (`Authorization: Bearer wac_live_...`) issued via `npm run cli -- billing api-key create --client <clientId>`, then calls the versioned REST API, e.g.:

```bash
curl -X POST http://localhost:3000/api/v1/messages \
  -H "Authorization: Bearer wac_live_xxx" \
  -H "Content-Type: application/json" \
  -d '{"accountId": "...", "to": "15551234567", "type": "text", "text": {"body": "Hello!"}}'
```

Inbound messages and status updates are pushed to the CRM's registered `WebhookEndpoint` URL, HMAC-signed with the endpoint's secret. Full request/response examples will be added alongside the OpenAPI spec in step 6.

## CLI command groups

Run `npm run cli -- <group> --help` for details.

| Group | What it does |
|---|---|
| `client` | CRUD + suspend/activate reseller clients |
| `account` | Provision, list, health-check, suspend/resume/deprovision WhatsApp accounts |
| `billing` | Plans, subscriptions, invoices (`pay`), `run-cycle`, `enforce`, `usage` |
| `message` | `send-text`, `send` (any type), conversation `log` |
| `template` | `create`/`list`/`sync`/`send` message templates |
| `webhook` | Inspect recent inbound, `simulate` a payload |
| `apikey` | Issue/list/revoke/rotate per-client API keys |
| `analytics` | Per-client dashboards + rate-limited `broadcast` |
| `system` | `status`, registered `tools`, `audit` log |

The command list is not hard-coded: each group is a self-registering `Tool` module in
[src/cli/commands/](src/cli/commands/), auto-discovered at startup. Drop in a new `*Command.ts`
that calls `registerTool(...)` and it appears in the CLI with no core changes.

## Public API reference (for the CRM)

Base URL `…/api/v1`, auth header `Authorization: Bearer wac_live_...`. Full schema at `/docs`.

| Method & path | Scope | Purpose |
|---|---|---|
| `POST /messages` | `messages:write` | Send a message (any type) |
| `GET /messages?accountId=` | `messages:read` | Conversation log |
| `GET /templates?accountId=` · `POST /templates` | `templates:read/write` | List / create templates |
| `POST /templates/:id/send` | `messages:write` | Send an approved template |
| `GET /contacts` · `POST /contacts` · `POST /contacts/:phone/opt` | `contacts:read/write` | Audience + opt-in/out |
| `GET /accounts` · `GET /usage?accountId=` | `accounts:read` / `usage:read` | Accounts + quota |
| `GET /billing/invoices` | `billing:read` | Invoices |
| `GET /webhooks` · `POST /webhooks` | `webhooks:read/write` | Register CRM callback URL |
| `GET /analytics` · `POST /broadcasts` | `analytics:read` / `messages:write` | Dashboards + bulk send |

Outbound events delivered to a registered callback URL are POSTed with headers
`X-WAC-Event` and `X-WAC-Signature-256: sha256=<hmac>` (HMAC of the raw body using the
endpoint secret returned at registration). Events: `message.inbound`, `message.status`,
`message.sent`, `invoice.created`, `invoice.paid`, `account.suspended`, `subscription.suspended`.

## Testing

```bash
npm test          # vitest: unit (crypto, billing dates, scopes) + integration (services + API)
```

Tests run against an isolated SQLite file (`test/test.db`, recreated each run); no external services needed.

## Docker / deployment

Local dev uses SQLite. For a production-like stack (API + PostgreSQL + Redis):

```bash
# 1. In .env set DB_PROVIDER=postgresql and a postgres DATABASE_URL; provide ENCRYPTION_KEY + Meta vars.
# 2. In prisma/schema.prisma change datasource provider to "postgresql".
docker compose up --build -d
docker compose run --rm api npx prisma migrate deploy   # apply migrations
docker compose run --rm api node dist/cli/index.js system status   # run the CLI in-container
```

The image's default command runs the public API (which also serves the Meta webhook routes).
Point your Meta App's webhook callback URL at `https://<host>/webhooks/whatsapp` with the
verify token from `META_WEBHOOK_VERIFY_TOKEN_DEFAULT`.

## Build order (all complete)

1. [x] Project scaffold, config, DB schema/migrations, `.env.example`, README
2. [x] `WhatsAppProvider` interface + Cloud API adapter + mock provider
3. [x] CLI core + module registry + `client`/`account` commands
4. [x] Plans, subscriptions, invoices, usage metering, manual `PaymentProvider`, billing commands
5. [x] Messaging + templates + webhook receiver + conversation log
6. [x] Public REST API with per-client API keys + OpenAPI spec
7. [x] Outbound webhooks/event bus, bulk/broadcast rate limiting, analytics
8. [x] Tests, Dockerfile, deployment README

## Security notes

- All provider secrets encrypted at rest (AES-256-GCM); never logged.
- API keys stored as SHA-256 hashes; only the prefix is shown back to the operator.
- Meta webhook signatures (`X-Hub-Signature-256`) are verified before processing (step 5).
- Every admin/API action is written to `AuditLog`.
