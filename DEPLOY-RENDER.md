# Deploying to Render.com (free tier)

Deploys the whole app (admin panel + client portal + REST API + Meta webhook receiver) as one
service with a public HTTPS URL, so real Meta webhooks reach it. Uses Render's **free web
service + free managed PostgreSQL** — $0 to start.

The `render.yaml` blueprint provisions both the database and the web service and wires them
together automatically. The Docker image is built for PostgreSQL; on first boot it creates the
tables (`prisma db push`) and auto-seeds your admin login + plans (no shell needed).

> Free-tier caveats: the web service **spins down after ~15 min idle** and cold-starts on the next
> request (Meta retries webhooks, so inbound still lands — just a few seconds late after idle).
> Render's **free PostgreSQL is time-limited** (expires after the trial window). Upgrade either to
> a paid plan when you go live for real.

---

## 1. Push this repo to GitHub

Create an empty repo on github.com (e.g. `orbit-whatsapp`), then in this folder:

```bash
git branch -M main
git remote add origin https://github.com/<your-username>/orbit-whatsapp.git
git push -u origin main
```

(`.env`, `dev.db`, `node_modules` are gitignored — secrets are not pushed.)

## 2. Create the services on Render

1. Sign in at https://render.com → **New +** → **Blueprint**.
2. Connect GitHub and pick the repo. Render reads `render.yaml` and proposes:
   - a **PostgreSQL** database (`orbit-db`, free)
   - a **web service** (`orbit-whatsapp`, free, Docker)
3. Click **Apply**. Render creates the database, then builds and starts the web service.
   `DATABASE_URL` is injected automatically from the database — you don't set it.

## 3. Set the secret env vars (web service → Environment tab)

| Key | Value |
|---|---|
| `ENCRYPTION_KEY` | a fresh 32-byte base64 key (generate below). **Do not reuse the dev key.** |
| `ADMIN_SESSION_SECRET` | any long random string |
| `ADMIN_EMAIL` | your admin login email |
| `ADMIN_PASSWORD` | a strong password (becomes your admin login) |
| `META_APP_ID` | your Meta App ID |
| `META_APP_SECRET` | your Meta App secret (App Settings → Basic) |
| `META_WEBHOOK_VERIFY_TOKEN_DEFAULT` | any string you choose (paste the same one into Meta) |
| `ANTHROPIC_API_KEY` | optional — only for AI auto-replies |

Generate the encryption key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```
`DB_PROVIDER`, `DATABASE_URL`, and `META_GRAPH_API_VERSION` are set by the blueprint.

After setting the vars, trigger a redeploy (Manual Deploy → Deploy latest commit) so they apply.

## 4. It's live

You get a URL like `https://orbit-whatsapp.onrender.com`:

- Admin panel: `https://orbit-whatsapp.onrender.com` → log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`
- Client portal: `https://orbit-whatsapp.onrender.com/portal`
- API docs: `https://orbit-whatsapp.onrender.com/docs`

## 5. Point Meta's webhook at it (makes real inbound messages work)

Meta App → **WhatsApp → Configuration → Webhooks**:

- **Callback URL:** `https://orbit-whatsapp.onrender.com/webhooks/whatsapp`
- **Verify token:** the exact value of `META_WEBHOOK_VERIFY_TOKEN_DEFAULT`
- **Verify and save**, then **Subscribe** to the `messages` field.

Now a message to your WhatsApp number is POSTed to your app → lands in the client's inbox →
automations fire — all live.

## 6. Create your first real client

Admin panel: **Clients → add** → **Portal login** (set a password) → connect their WhatsApp number
via the **Accounts** wizard → send them `…/portal` + their login.

---

### Local development is unaffected

The committed schema stays on SQLite, so `npm run dev:api`, `npm test`, and `npm run cli` keep
working locally with zero database setup. Only the deployed Docker image uses PostgreSQL.

### Going always-on / permanent

When ready for production: upgrade the web service to a paid instance (no cold starts) and the
database to a paid PostgreSQL plan (no expiry). No code changes needed.
