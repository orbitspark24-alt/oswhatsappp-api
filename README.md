# WhatsApp API Reseller Console Platform

A console-driven platform for provisioning, metering, and billing **WhatsApp Business API (Meta Cloud API)** accounts for end-clients on a monthly subscription, with a public REST API for a future CRM to plug into.

## Status

🚧 Under active build-out. See "Build order" below for what exists vs. what's next.

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

## Build order (tracking)

1. [x] Project scaffold, config, DB schema/migrations, `.env.example`, README — **this commit**
2. [ ] `WhatsAppProvider` interface + Cloud API adapter + mock provider
3. [ ] CLI core + module registry + `client`/`account` commands
4. [ ] Plans, subscriptions, invoices, usage metering, manual `PaymentProvider`, billing commands
5. [ ] Messaging + templates + webhook receiver + conversation log
6. [ ] Public REST API with per-client API keys + OpenAPI spec
7. [ ] Outbound webhooks/event bus, bulk/broadcast rate limiting, analytics
8. [ ] Tests, Dockerfile, deployment README

## Security notes

- All provider secrets encrypted at rest (AES-256-GCM); never logged.
- API keys stored as SHA-256 hashes; only the prefix is shown back to the operator.
- Meta webhook signatures (`X-Hub-Signature-256`) are verified before processing (step 5).
- Every admin/API action is written to `AuditLog`.
