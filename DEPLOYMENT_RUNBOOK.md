# NAccounting (NeoAccountingZ) — Deployment & Infrastructure Runbook

> Use this document for all deployment, SSH, migration, and infrastructure tasks
> for this app. It runs as a **tenant on the same EC2 instance as BrokerApp** —
> see that repo's own `DEPLOYMENT_RUNBOOK.md` for the full picture of what else
> lives on the box.

---

## 1. AWS Infrastructure (shared with BrokerApp)

> ⚠️ This app does **not** have its own EC2 instance. It shares a single
> `t3.small` box with BrokerApp (PropCRM). Anything that affects the instance,
> nginx, or Postgres as a whole affects both apps.

### EC2 Instance

| Field | Value |
|---|---|
| Instance ID | `i-073b553040acb1376` |
| Name | `brokerapp-demo` |
| Type | `t3.small` (2 vCPU / 2 GiB RAM — shared across all apps on the box) |
| Elastic IP | `18.158.219.70` |
| Region | `eu-central-1` (Frankfurt) |
| OS | Ubuntu (nginx/1.18.0) |
| Security Group | `sg-0c3c924552c8b2752` (`brokerapp-demo-sg`) |

### What Runs Where on the EC2

| App | Process | Port | Notes |
|---|---|---|---|
| NAccounting (this app) | PM2 `naccounting` (`next start`) | `3002`, internal only | |
| BrokerApp API | PM2 `api` | `3001`, internal only | Not this repo |
| BrokerApp web | PM2 `web` | `3000`, internal only | Not this repo |
| PostgreSQL | `localhost:5432` | — | Shared instance, **separate DB + role** (see §3) |
| nginx | port `80` | — | Routes all three by `Host` header |

**Memory is the binding constraint**, not CPU or disk — with all three Node
processes + Postgres running, available memory sits around 1–1.2 GiB. A
`next build` on this app alone needs roughly that much headroom; if BrokerApp
also needs a build at the same time, do them sequentially, not concurrently.

### Application Load Balancer / Domain

Traffic reaches the box via the same ALB and wildcard certificate BrokerApp
already uses — no separate ALB listener or ACM certificate was needed for
this app.

| Field | Value |
|---|---|
| ALB | `propcrm-alb` (`propcrm-alb-1309728277.eu-central-1.elb.amazonaws.com`) |
| ACM Certificate | Covers `propcrm.app` **and `*.propcrm.app`** (wildcard SAN) |
| Route 53 zone | `propcrm.app` — hosted zone `Z05082291BTE2MGQB69EU` |
| This app's DNS record | `accounting.propcrm.app` → A-alias → `propcrm-alb` |
| Public URL | `https://accounting.propcrm.app` |

If you ever need another hostname for this app (e.g. a custom domain instead
of a `propcrm.app` subdomain), it will need its own ACM certificate + ALB
listener cert (SNI) — the wildcard only covers `*.propcrm.app`.

---

## 2. App Layout on EC2

| Path | Purpose |
|---|---|
| `/home/ubuntu/naccounting/` | Git repo root (`origin` → `github.com/AdityaKi1007/NAccounting`) |
| `/home/ubuntu/naccounting/.env` | Real secrets — **not tracked in git** (see §5). Recreate from `.env.example` on a fresh checkout. |
| `/home/ubuntu/.naccounting_db_pass` | Generated Postgres password for the `naccounting` role (chmod 600) |
| `/home/ubuntu/deploy-naccounting.sh` | Deploy script (see §3) |
| `/etc/nginx/sites-enabled/brokerapp` | **The live nginx config** — this app's server block lives in the *same file* as BrokerApp's, appended after the `go.propcrm.app`/`api.propcrm.app` block. See the gotcha in §6. |

### Process Manager

PM2 runs under the `ubuntu` user (same daemon that manages BrokerApp's `api`
and `web`) and is wired to systemd, so `naccounting` restarts automatically
on instance reboot along with everything else — no separate systemd unit was
created for it.

| PM2 name | What it runs | Port |
|---|---|---|
| `naccounting` | `next start -p 3002` (built `.next/`) | 3002 |

---

## 3. Deployment

### Prerequisites

- AWS CLI configured for account `964376924380`
- SSH key at `~/.ssh/id_ed25519` (pushed via EC2 Instance Connect, same as BrokerApp)
- Git remote `origin` → `git@github.com:AdityaKi1007/NAccounting.git`

### SSH Access (EC2 Instance Connect — no .pem required)

```bash
aws ec2-instance-connect send-ssh-public-key \
  --instance-id i-073b553040acb1376 \
  --instance-os-user ubuntu \
  --ssh-public-key file://$HOME/.ssh/id_ed25519.pub \
  --region eu-central-1 --availability-zone eu-central-1b

ssh -i ~/.ssh/id_ed25519 -o StrictHostKeyChecking=no ubuntu@18.158.219.70
```

The pushed key is valid for ~60 seconds — SSH in immediately after.

### Standard Deploy

> ⚠️ **Always `git push origin main` FIRST.** The deploy script does a
> `git pull` on the server; if you haven't pushed, it deploys stale code.

A deploy script at `/home/ubuntu/deploy-naccounting.sh` handles everything:
self-daemonizes (survives a dropped SSH session) → `git pull` → `npm install`
→ `npm run migrate:up` → `npm run build` → restart PM2 `naccounting` only.

```bash
# Step 1 — push (MANDATORY first)
git push origin main

# Step 2 — SSH in and run the deploy script
aws ec2-instance-connect send-ssh-public-key \
  --instance-id i-073b553040acb1376 \
  --instance-os-user ubuntu \
  --ssh-public-key file://$HOME/.ssh/id_ed25519.pub \
  --region eu-central-1 --availability-zone eu-central-1b

ssh -i ~/.ssh/id_ed25519 -o StrictHostKeyChecking=no ubuntu@18.158.219.70 "bash ~/deploy-naccounting.sh"
```

If the SSH session drops mid-deploy, reconnect and run:
```bash
tail -f /tmp/deploy-naccounting.log
```
The build keeps running in the background regardless.

### ⚠️ Never `pkill -f "next-server"` on this box

BrokerApp's `web` process and this app are **both** literally named
`next-server` in `ps`. A blanket `pkill -f next-server` (which BrokerApp's
own deploy script uses, scoped to itself) would kill BrokerApp's frontend too.
`deploy-naccounting.sh` only ever frees port `3002` via `fuser -k 3002/tcp` —
keep it that way in any future edits.

---

## 4. Database

### Isolation from BrokerApp

This app has its **own** Postgres role and database on the shared Postgres
instance — never reuses BrokerApp's:

| Field | Value |
|---|---|
| Database | `neoaccountingz` |
| Role | `naccounting` |
| Password | `/home/ubuntu/.naccounting_db_pass` on the EC2 box |

### Migrations

Migrations use `node-pg-migrate`, not Prisma. They're applied automatically
by the deploy script (`npm run migrate:up`), and are idempotent — already-run
migrations are tracked in the `pgmigrations` table and skipped.

**Manual run** (e.g. emergency hotfix without a full deploy):
```bash
cd /home/ubuntu/naccounting
npm run migrate:up
pm2 restart naccounting
```

**Writing a new migration:** put the SQL/JS in `migrations/`, following
`node-pg-migrate`'s naming convention (`<timestamp>_<name>.js`), commit it,
push, and deploy normally.

### DB Access on EC2

```bash
set -a && source /home/ubuntu/naccounting/.env && set +a
psql "$DATABASE_URL"
```

### Demo / Seed Data

```bash
cd /home/ubuntu/naccounting
npm run seed
```
Creates a demo org **NeoProp Technologies** with login
`aditya.kishor@gmail.com` / `Password123!`. Safe to re-run — it's additive,
not destructive, and won't touch any real organizations already in the DB.

---

## 5. Environment Variables — `.env` is intentionally NOT in git

The upstream repo originally committed `.env` (with a real, if weak, default
DB password) — only `.env.local` was gitignored. This was fixed in commit
`82ba6ee` ("Untrack .env and fix ESLint unescaped-entities build errors"):
`.env` was removed from tracking and added to `.gitignore`.

**Practical effect:** a fresh `git clone` will **not** come with a working
`.env` — copy `.env.example` and fill in real values yourself:

```bash
cp .env.example .env
```

Required:
- `DATABASE_URL` — `postgresql://naccounting:<password>@localhost:5432/neoaccountingz` on the shared box
- `AUTH_SECRET` — long random string (`openssl rand -hex 32`); **do not rotate on the live box** once real users have saved SMTP/S3 credentials through the Settings UI — this value is also used to derive the key that encrypts those, and rotating it breaks decryption of anything already saved
- `AUTH_TRUST_HOST=true`
- `NEXTAUTH_URL=https://accounting.propcrm.app` (or `http://localhost:3000` locally)

Optional (S3 attachments / SMTP email) — left blank on the live box; the app
degrades gracefully with a clear in-app error rather than crashing. Configure
either via the `.env` fallback vars or per-organization via
Settings → Integrations in the app itself.

---

## 6. Nginx — known config drift

`/etc/nginx/sites-available/brokerapp` and `/etc/nginx/sites-enabled/brokerapp`
are **two independent files, not a symlink pair**, on this box (pre-existing
drift, not introduced by this app's setup — discovered while adding this
app's server block). Always check and edit **both** — `sites-enabled` is what
nginx actually loads.

This app's block (appended after BrokerApp's `go.propcrm.app`/`api.propcrm.app`
block, before the marketing-site block):

```nginx
server {
    listen 80;
    server_name accounting.propcrm.app;

    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

After any nginx edit: `sudo nginx -t && sudo nginx -s reload`. Keep backup
copies **outside** `sites-enabled/` (e.g. `/home/ubuntu/nginx-backups/`) —
nginx's `include sites-enabled/*` picks up any file in that directory
regardless of name, so a `.bak` file left inside it can cause a
`duplicate default server` error on the next `nginx -t`.

---

## 7. Health Check / Troubleshooting

```bash
# App reachable end-to-end
curl -sI https://accounting.propcrm.app/

# PM2 status
ssh ubuntu@18.158.219.70 "pm2 list"

# App logs
ssh ubuntu@18.158.219.70 "pm2 logs naccounting --lines 100 --nostream"

# Memory headroom (shared with BrokerApp — watch this before any build)
ssh ubuntu@18.158.219.70 "free -h"
```

If PM2 shows `naccounting` down after a reboot, the shared systemd/PM2
resurrect should bring it back automatically along with BrokerApp's
processes; if not:
```bash
ssh ubuntu@18.158.219.70 "pm2 resurrect || pm2 start naccounting"
```

---

## 8. Known Limitations (inherits BrokerApp's demo-environment caveats)

- ❌ Single EC2 instance, single Postgres instance — no backups, no
  replication, no redundancy (same as BrokerApp)
- ❌ Shared 2 GiB RAM budget across three Node processes + Postgres — a
  simultaneous build of this app and BrokerApp could exhaust memory
- ❌ No CI/CD — deployments are manual via `deploy-naccounting.sh`
- ❌ No S3/SMTP configured by default — attachments and email sending are
  disabled until an org configures them (or the `.env` fallback vars are set)
