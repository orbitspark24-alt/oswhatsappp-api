# Deploying to Render.com

This deploys the whole app (admin panel + client portal + REST API + Meta webhook receiver)
as one always-on service with a public HTTPS URL, so real Meta webhooks reach it.

It uses **SQLite on a persistent disk** (mounted at `/data`) — simplest setup, no separate
database to manage. A persistent disk needs Render's **Starter** instance (~$7/mo). On first
boot the app auto-creates your admin login and the default plans (no shell needed).

---

## 1. Push this repo to GitHub

Render deploys from a Git repo. Create an empty repo on github.com (e.g. `orbit-whatsapp`), then:

```bash
git branch -M main
git remote add origin https://github.com/<your-username>/orbit-whatsapp.git
git push -u origin main
```

(Your `.env`, `dev.db`, and `node_modules` are gitignored — secrets are not pushed.)

## 2. Create the service on Render

1. Sign in at https://render.com → **New +** → **Blueprint**.
2. Connect your GitHub and pick the repo. Render reads `render.yaml` and proposes the service.
3. Approve it. The instance plan is **Starter** (required for the persistent disk).

## 3. Set the environment variables (Render dashboard → your service → Environment)

These are marked `sync: false` in the blueprint, so you set them in the dashboard (never in git):

| Key | Value |
|---|---|
| `ENCRYPTION_KEY` | a fresh 32-byte base64 key — generate one (below). **Do not reuse the dev key.** |
| `ADMIN_SESSION_SECRET` | any long random string |
| `ADMIN_EMAIL` | your admin login email (e.g. `you@yourbrand.com`) |
| `ADMIN_PASSWORD` | a strong password (this becomes your admin login) |
| `META_APP_ID` | your Meta App ID |
| `META_APP_SECRET` | your Meta App secret (App Settings → Basic) |
| `META_WEBHOOK_VERIFY_TOKEN_DEFAULT` | any string you choose (you'll paste the same one into Meta) |
| `ANTHROPIC_API_KEY` | optional — only if you want AI auto-replies |

Generate the encryption key locally:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

`DB_PROVIDER`, `DATABASE_URL`, and `META_GRAPH_API_VERSION` are already set by the blueprint.

## 4. Deploy

Render builds the Docker image and starts it. On boot it runs `prisma migrate deploy` (creates
the database on the disk) and auto-seeds your admin + plans. When it's live you get a URL like:

```
https://orbit-whatsapp.onrender.com
```

- Admin panel: `https://orbit-whatsapp.onrender.com`  → log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`
- Client portal: `https://orbit-whatsapp.onrender.com/portal`
- API docs: `https://orbit-whatsapp.onrender.com/docs`

## 5. Point Meta's webhook at it (this is what makes real inbound messages work)

In your Meta App → **WhatsApp → Configuration → Webhooks**:

- **Callback URL:** `https://orbit-whatsapp.onrender.com/webhooks/whatsapp`
- **Verify token:** the exact value you set for `META_WEBHOOK_VERIFY_TOKEN_DEFAULT`
- Click **Verify and save** (Meta calls your URL; it should succeed).
- **Subscribe** to the `messages` field.

Now when someone messages your WhatsApp number, Meta POSTs to your app, the message lands in the
client's inbox, and any automations fire — all live.

## 6. Create your first real client

In the admin panel: **Clients → add** → **Portal login** (set a password) → connect their WhatsApp
number via the **Accounts** wizard → send them `…/portal` + their login.

---

### Free-tier alternative (no $7/mo)

Render's free web service has **no persistent disk** and spins down, so SQLite would reset. To
stay free, use Render's free **PostgreSQL** instead:

1. In `prisma/schema.prisma` change `datasource db { provider = "postgresql" }`.
2. Regenerate migrations: `npx prisma migrate dev --name init` (against a Postgres URL), commit them.
3. In `render.yaml`: remove the `disk:` block, set `DB_PROVIDER=postgresql`, and set `DATABASE_URL`
   to the Render Postgres connection string (add a `databases:` entry or link an existing one).

SQLite + Starter is simpler and fine for early scale; move to Postgres when you grow.
