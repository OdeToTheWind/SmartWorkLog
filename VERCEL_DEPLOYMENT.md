# Smart WorkLog AI — Vercel Deployment Guide

Complete walkthrough to host **Smart WorkLog AI** on **Vercel** and remove every trace of Emergent from the project. End-to-end: **~2 hours** the first time (including DNS propagation), ~10 minutes for every future code push.

> ⚠️ **Important architectural note**: Vercel's primary product is **frontend hosting + serverless functions**. Smart WorkLog has a **long-running FastAPI backend** with an APScheduler that fires cron jobs every 60s. **Vercel does NOT support long-running processes.** Three deployment patterns are described below — pick the one that matches your needs.

---

## Table of contents

1. [Decision: which pattern do I need?](#1-decision-which-pattern-do-i-need)
2. [Pattern A — Frontend on Vercel, Backend on Railway / Render / Fly](#2-pattern-a--frontend-on-vercel-backend-on-railway--render--fly-recommended)
3. [Pattern B — Frontend on Vercel, Backend converted to serverless](#3-pattern-b--frontend-on-vercel-backend-converted-to-serverless-major-rewrite)
4. [Pattern C — Self-hosted VPS (no Vercel)](#4-pattern-c--self-hosted-vps-no-vercel)
5. [Removing every Emergent dependency from the codebase](#5-removing-every-emergent-dependency-from-the-codebase)
6. [Step-by-step: Pattern A deployment](#6-step-by-step-pattern-a-deployment)
7. [Post-deploy verification checklist](#7-post-deploy-verification-checklist)
8. [Rebuilding the Android APK after migration](#8-rebuilding-the-android-apk-after-migration)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Decision: which pattern do I need?

| You want…                                                              | Recommended pattern                             | Effort  |
| ---------------------------------------------------------------------- | ----------------------------------------------- | ------- |
| Cheapest, simplest, keep the backend code 100% unchanged               | **Pattern A** (Vercel + Railway)                | ⭐ Low   |
| Single-platform: everything on Vercel only                             | Pattern B (rewrite backend to serverless funcs) | ⭐⭐⭐⭐ Very high — significant code changes |
| Full ownership of the server, no SaaS dependencies                     | Pattern C (VPS — see `MIGRATION.md`)            | ⭐⭐ Medium |
| Stay on Emergent but with a custom domain                              | None of these — use Emergent's domain settings  | ⭐ Trivial |

**Most teams should use Pattern A.** It keeps Vercel's excellent frontend CDN + zero-config CI/CD while offloading the FastAPI backend to a platform that supports long-running processes. Total monthly cost: **$0** on free tiers for small teams, ~$5–10/month at scale.

---

## 2. Pattern A — Frontend on Vercel, Backend on Railway / Render / Fly (RECOMMENDED)

### Architecture

```
┌──────────────────────────────────────┐         ┌──────────────────────────────────────┐
│  Vercel (CDN + Edge)                 │         │  Railway / Render / Fly.io           │
│  - React build output                │ ──────► │  - FastAPI server (Docker)           │
│  - manifest.json, sw.js, icons       │  HTTPS  │  - APScheduler cron jobs             │
│  - .well-known/assetlinks.json       │         │  - Telegram webhook handler          │
└──────────────────────────────────────┘         └────────────────────┬─────────────────┘
                                                                       │
                                            ┌──────────────────────────┼──────────────────────┐
                                            ▼                          ▼                      ▼
                                     ┌────────────────┐         ┌────────────────┐    ┌──────────────────┐
                                     │ MongoDB Atlas  │         │ AWS S3         │    │ Google Gemini API│
                                     │ (free tier)    │         │ (or Backblaze) │    │ (your API key)   │
                                     └────────────────┘         └────────────────┘    └──────────────────┘
```

### Why this works

- **Vercel** is the world's best CDN for React. It auto-deploys on every Git push, hands out HTTPS for free, and has zero cold-start for static assets.
- **Railway / Render / Fly.io** all support long-running Python processes (FastAPI + APScheduler) with HTTPS, $5/month free credit, and zero-config Docker deploys.
- **MongoDB Atlas** has a perpetually free 512 MB tier — plenty for tens of thousands of daily updates.
- **AWS S3 / Backblaze B2** for attachment storage costs ~$0.01/GB/month.

### Costs (small team, <50 users)

| Service       | Monthly cost         | Free tier sufficient?             |
| ------------- | -------------------- | --------------------------------- |
| Vercel        | $0                   | ✅ Always free for hobby projects |
| Railway       | $0 (within $5 credit)| ✅ Yes — backend uses <$3/month   |
| MongoDB Atlas | $0                   | ✅ M0 cluster (512 MB)            |
| Backblaze B2  | $0–1                 | ✅ First 10 GB free               |
| Gemini API    | Pay-per-use          | ✅ Generous free tier             |
| Telegram      | $0                   | ✅ Always free                    |
| **Total**     | **$0/month**         | for small teams                   |

Skip to **section 6** for the step-by-step deployment.

---

## 3. Pattern B — Frontend on Vercel, Backend converted to serverless (MAJOR REWRITE)

If you want everything on Vercel:

### What you'd have to change

1. **Convert FastAPI to Vercel Serverless Functions**
   - Move each route from `server.py` into `/api/<route>.py` files (Vercel auto-detects them)
   - Wrap each one in a Python serverless function handler
   - **Estimated effort: 2–3 days of refactoring**
2. **Remove APScheduler** — Vercel functions can't run cron in-process. Replace with **Vercel Cron Jobs** (separate `vercel.json` config) or **GitHub Actions** scheduled workflows.
3. **Remove the Telegram polling/webhook keep-alive** — webhooks still work because Telegram POSTs to your serverless function, but you must ensure the function returns within Vercel's 10-second timeout.
4. **Stateless object storage** — `EMERGENT_LLM_KEY` must be swapped to direct `boto3` against S3.
5. **MongoDB connection pooling** — every serverless invocation creates a new connection by default. You'll need `motor` with a global module-level client and explicit connection-reuse patterns to avoid hitting Atlas's connection limit.

### Why we don't recommend this for Smart WorkLog

- The 10-second timeout breaks the Gemini AI calls during daily-update parsing (they can take 4–8 seconds, leaving no room for DB writes + response)
- APScheduler's natural-language scheduling rules (e.g. "Mon–Fri 18:00 in user's timezone") becomes harder when split across Vercel Cron + multiple timezones
- Higher cost per request once you outgrow the free tier
- Cold starts hurt Telegram bot response times

If you still want to pursue this, ask me and I'll provide a full file-by-file refactoring plan in a separate doc.

---

## 4. Pattern C — Self-hosted VPS (no Vercel)

Already covered in detail at **[`MIGRATION.md`](./MIGRATION.md)**. TL;DR:

- One Ubuntu VM (DigitalOcean / Hetzner / Linode) — ~$5–10/month
- Nginx + Certbot HTTPS + supervisord + MongoDB on the same box
- ~1–2 hour setup
- Maximum ownership, no third-party SaaS lock-in

---

## 5. Removing every Emergent dependency from the codebase

These changes apply regardless of which deployment pattern you pick. After completing them, the project has **zero runtime ties to Emergent**.

### 5.1 — `EMERGENT_LLM_KEY` (used only for attachment uploads)

**Current state**: Object storage uses the `emergentintegrations` library which talks to an Emergent-managed S3-compatible bucket.

**Replacement**: Direct AWS S3 (or Backblaze B2 — S3-compatible) via `boto3`.

```bash
# 1. Install boto3
cd backend && pip install boto3 && pip freeze > requirements.txt

# 2. Sign up at https://aws.amazon.com (or https://www.backblaze.com/cloud-storage)
#    Create a bucket: e.g. `worklog-attachments`
#    Create an IAM user with these permissions on that bucket only:
#      s3:PutObject, s3:GetObject, s3:DeleteObject
#    Save the access key + secret.

# 3. Add to backend/.env:
echo 'AWS_ACCESS_KEY_ID=AKIA...' >> backend/.env
echo 'AWS_SECRET_ACCESS_KEY=...' >> backend/.env
echo 'AWS_S3_BUCKET=worklog-attachments' >> backend/.env
echo 'AWS_S3_REGION=us-east-1' >> backend/.env
```

**Code change** in `backend/server.py` — find the attachment-upload section (search for `EMERGENT_LLM_KEY` or `emergentintegrations`) and replace with:

```python
import boto3
from botocore.exceptions import ClientError

_s3 = boto3.client(
    "s3",
    aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
    aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
    region_name=os.environ.get("AWS_S3_REGION", "us-east-1"),
)
_S3_BUCKET = os.environ["AWS_S3_BUCKET"]

def upload_attachment(file_bytes: bytes, filename: str, content_type: str) -> str:
    key = f"attachments/{uuid.uuid4()}/{filename}"
    _s3.put_object(Bucket=_S3_BUCKET, Key=key, Body=file_bytes, ContentType=content_type)
    # Pre-signed URL valid for 7 days
    url = _s3.generate_presigned_url("get_object", Params={"Bucket": _S3_BUCKET, "Key": key}, ExpiresIn=7*24*3600)
    return url
```

Then remove the `emergentintegrations` dependency:

```bash
pip uninstall -y emergentintegrations
sed -i '/emergentintegrations/d' /app/backend/requirements.txt
```

### 5.2 — Remove the Emergent "Made with Emergent" badge

```bash
# Search and remove every reference
grep -rln "Made with Emergent\|emergent.sh\|emergentagent\|posthog" /app/frontend/src/ /app/frontend/public/
# Edit each file to remove the badge component / script
```

The badge is typically injected by Emergent's platform into `<body>` at deploy time — it won't appear when you host elsewhere.

### 5.3 — Remove the PostHog analytics script

Emergent injects a PostHog tracker into the production bundle. After moving off Emergent it disappears automatically (it's not in your source code). To be 100% sure, add this to `index.html` and rebuild:

```html
<meta http-equiv="Content-Security-Policy"
      content="script-src 'self' 'unsafe-inline' 'unsafe-eval'; object-src 'none';">
```

### 5.4 — Drop `emergentintegrations` from requirements

```bash
grep -v emergentintegrations /app/backend/requirements.txt > /tmp/req && mv /tmp/req /app/backend/requirements.txt
```

### 5.5 — Remove the `.emergent/` folder

```bash
rm -rf /app/.emergent
```

This folder stores Emergent-platform metadata (build artifacts, deploy state). It's not used at runtime.

### 5.6 — Update all docs

Search/replace `emergent.host` and `emergentagent.com` URLs in all `.md` files with your new domain:

```bash
find /app -name '*.md' -exec sed -i 's|task-intelligence-13\.emergent\.host|worklog.yourcompany.com|g' {} +
find /app -name '*.md' -exec sed -i 's|task-intelligence-13\.preview\.emergentagent\.com|worklog-preview.yourcompany.com|g' {} +
```

---

## 6. Step-by-step: Pattern A deployment

We'll use **Vercel** for the frontend, **Railway** for the backend, **MongoDB Atlas** for the database, and **Backblaze B2** for attachments. Total time: ~90 minutes.

### Step 6.1 — Sign-ups (15 min)

Create accounts at:

1. https://vercel.com/signup — connect your GitHub account
2. https://railway.app — connect your GitHub account
3. https://www.mongodb.com/cloud/atlas/register — create a free M0 cluster
4. https://www.backblaze.com/cloud-storage — sign up, no card needed for first 10 GB
5. https://aistudio.google.com/app/apikey — get a Gemini API key if you don't have one

### Step 6.2 — Push your repo to GitHub (5 min)

If your code is still in Emergent, use the **"Save to GitHub"** feature to push to a private repo. Otherwise:

```bash
cd /app
git init && git remote add origin git@github.com:<your-org>/smart-worklog.git
git add . && git commit -m "Initial commit"
git push -u origin main
```

### Step 6.3 — Set up MongoDB Atlas (10 min)

1. In Atlas → **Database** → **Create Cluster** → free **M0** → pick the AWS region closest to your Railway region (e.g. both in `us-east-1`)
2. **Database Access** → **Add user** → username `worklog`, password `<generate strong>`, role: **Read and write to any database**
3. **Network Access** → **Add IP Address** → select **"Allow access from anywhere"** (`0.0.0.0/0`) for simplicity, or whitelist Railway's IPs
4. **Database** → **Connect** → **Drivers** → copy the connection string. Looks like:
   ```
   mongodb+srv://worklog:<password>@cluster0.xxxxx.mongodb.net/test_database?retryWrites=true&w=majority
   ```
5. Save this URL — you'll paste it into Railway in step 6.5

### Step 6.4 — Set up Backblaze B2 (5 min)

1. Sign in → **Create Bucket** → name: `worklog-attachments`, files: **Private**
2. **App Keys** → **Add a New Application Key** → name `worklog-backend`, only this bucket, **Read & Write** access
3. Save the `keyID`, `applicationKey`, `endpoint` (e.g. `s3.us-west-002.backblazeb2.com`)

### Step 6.5 — Deploy the backend to Railway (20 min)

1. **Railway** → **New Project** → **Deploy from GitHub repo** → choose your repo → set **Root Directory** to `backend`
2. Railway auto-detects Python. Make sure there's a `requirements.txt` and add a `Procfile`:

   Create `/app/backend/Procfile`:
   ```
   web: uvicorn server:app --host 0.0.0.0 --port $PORT --workers 2
   ```

3. Add **environment variables** (Settings → Variables → Raw Editor):

   ```env
   MONGO_URL=mongodb+srv://worklog:<password>@cluster0.xxxxx.mongodb.net/test_database?retryWrites=true&w=majority
   DB_NAME=test_database
   CORS_ORIGINS=https://worklog.yourcompany.com,https://worklog-preview.yourcompany.com
   JWT_SECRET=<generate with `openssl rand -hex 32`>
   GEMINI_API_KEY=<your Gemini key>
   TELEGRAM_BOT_TOKEN=<your bot token>
   MAKE_WEBHOOK_SECRET=<your make secret>
   MAKE_DIGEST_WEBHOOK_URL=<your make digest URL>
   MAKE_WEEKLY_PDF_WEBHOOK_URL=<your make weekly PDF URL>
   SCHEDULER_ENABLED=true
   DIGEST_HOUR_UTC=18
   PUBLIC_BASE_URL=https://api.worklog.yourcompany.com
   AWS_ACCESS_KEY_ID=<B2 keyID>
   AWS_SECRET_ACCESS_KEY=<B2 applicationKey>
   AWS_S3_BUCKET=worklog-attachments
   AWS_S3_REGION=us-west-002
   AWS_S3_ENDPOINT_URL=https://s3.us-west-002.backblazeb2.com
   ```

4. **Settings** → **Networking** → **Generate Domain** → Railway gives you `worklog-backend-production.up.railway.app`
5. **Settings** → **Custom Domain** (optional) → add `api.worklog.yourcompany.com` → Railway tells you the CNAME to add to your DNS provider
6. Wait ~2 minutes for the build → check **Deployments → View logs** → look for `Application startup complete`
7. Verify: `curl https://worklog-backend-production.up.railway.app/api/` → should return `{"app":"Smart WorkLog AI","ok":true}`

### Step 6.6 — Deploy the frontend to Vercel (15 min)

1. **Vercel** → **Add New Project** → import your GitHub repo
2. **Framework Preset**: Create React App (auto-detected)
3. **Root Directory**: `frontend`
4. **Build Command**: `yarn build`
5. **Output Directory**: `build`
6. **Install Command**: `yarn install --frozen-lockfile`
7. **Environment Variables**:
   ```
   REACT_APP_BACKEND_URL=https://api.worklog.yourcompany.com
   ```
   (Use the Railway-generated URL or your custom domain from step 6.5.5.)
8. Click **Deploy** → wait ~2 minutes
9. **Custom Domain** (optional): Vercel project → **Settings** → **Domains** → add `worklog.yourcompany.com` → follow the DNS instructions Vercel shows

### Step 6.7 — Restore your MongoDB data (5 min)

```bash
# On your laptop, with mongodb-database-tools installed
brew install mongodb-database-tools   # or apt install mongodb-database-tools

# 1. Backup from Emergent (if you haven't already)
#    Open Emergent's web terminal for your project and run:
mongodump --uri="$MONGO_URL" --db=test_database --archive=/tmp/worklog-backup.gz --gzip
# Download /tmp/worklog-backup.gz to your laptop

# 2. Restore to Atlas
mongorestore --uri="mongodb+srv://worklog:<password>@cluster0.xxxxx.mongodb.net" --gzip --archive=/path/to/worklog-backup.gz
```

### Step 6.8 — Re-point Telegram + Make.com (5 min)

```bash
# Telegram webhook (replace TOKEN + URL)
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://api.worklog.yourcompany.com/api/telegram/webhook"

# Make.com — open each scenario in your Make dashboard,
# replace any task-intelligence-13.emergent.host URLs with api.worklog.yourcompany.com
```

### Step 6.9 — Verify end-to-end (5 min)

Open `https://worklog.yourcompany.com` in a browser:
- ✅ Login screen loads with no console errors
- ✅ Sign in with your existing super-admin email
- ✅ Dashboard renders with cards/widgets
- ✅ Submit a test daily update → AI parses it
- ✅ DM your Telegram bot `/today` → receives a reply

If anything fails, see [Section 9 — Troubleshooting](#9-troubleshooting).

### Step 6.10 — Decommission Emergent (optional, after 2 weeks of stable operation)

- Emergent dashboard → your project → **Pause** (preserves backup)
- After 2 weeks of zero issues: **Delete**
- Take one final `mongodump` from Atlas as a safety backup

---

## 7. Post-deploy verification checklist

Run through this list after every deploy:

- [ ] `curl https://api.<your domain>/api/` returns `{"ok":true}`
- [ ] Frontend loads with `200` status — no `text/html` MIME errors in console
- [ ] Service worker registers (DevTools → Application → Service Workers → status: activated)
- [ ] `manifest.json` reachable and valid (DevTools → Application → Manifest)
- [ ] Login with seeded `admin@acme.com` / `pass1234` works
- [ ] Submit a daily update → AI summary appears within ~5s
- [ ] DM Telegram bot `/today` → receives translated reply
- [ ] Upload an attachment → returns a working URL (B2 bucket)
- [ ] Make.com scenario manually fires → digest webhook called → 200 response
- [ ] APK download banner appears if `/app/android/app-release-signed.apk` exists

---

## 8. Rebuilding the Android APK after migration

The Android APK is a **Trusted Web Activity** that loads the production URL. After moving to a new domain you MUST rebuild:

1. On your laptop, edit `/app/android/twa-manifest.json`:
   ```json
   {
     "host": "worklog.yourcompany.com",
     "fullScopeUrl": "https://worklog.yourcompany.com/",
     "iconUrl": "https://worklog.yourcompany.com/logo512.png",
     "maskableIconUrl": "https://worklog.yourcompany.com/logo512.png",
     "appVersionCode": 2
   }
   ```
2. Bump `appVersionCode` by 1 (e.g. `1` → `2`)
3. `cd /app/android && ./build.sh` — same keystore is reused, no need to re-sign
4. Upload the new `app-release-signed.apk` to `/app/android/` in your project (via Railway's file system or back into your Git repo)
5. Your team installs the new APK over the old one — data preserved
6. Update `.well-known/assetlinks.json` only if the SHA-256 fingerprint changed (it won't if you used the same keystore)

---

## 9. Troubleshooting

| Symptom                                                                | Cause                                                              | Fix                                                                                                                  |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Frontend loads, login fails with CORS error                            | `CORS_ORIGINS` on backend doesn't list the frontend domain         | Add the Vercel domain to `CORS_ORIGINS` in Railway env vars → backend auto-restarts                                  |
| Daily-update AI never returns a summary                                | Gemini API key not set or rate-limited                             | Check Railway logs; verify `GEMINI_API_KEY` is valid at https://aistudio.google.com                                  |
| Telegram bot silent                                                    | Webhook not pointed at new URL                                     | Re-run `setWebhook` (step 6.8)                                                                                       |
| MongoDB connection timeouts                                            | Atlas IP whitelist excludes Railway                                | Atlas → Network Access → add `0.0.0.0/0` (or specific Railway IPs)                                                  |
| Attachment uploads return 500                                          | B2 credentials wrong or bucket name mismatch                       | Check Railway logs; verify `AWS_S3_*` vars                                                                           |
| Service worker not updating after deploy                               | Browser cached old SW                                              | Users do one hard refresh (Ctrl/Cmd+Shift+R) once; new SW v3 self-heals from there                                  |
| `Made with Emergent` badge still showing                               | The badge is added by Emergent at deploy time, won't appear on Vercel | Confirm you're hitting the Vercel URL, not the Emergent URL                                                       |
| `posthog` script blocked in DevTools console                           | The Emergent runtime injects it; gone after migration              | Ignore — won't appear on Vercel                                                                                      |
| APScheduler not running                                                | Railway sleeps free-tier services after inactivity                 | Upgrade to Railway Hobby plan ($5/month) OR replace APScheduler with Make.com schedules + a manual cron endpoint    |
| First Gemini call after sleep is slow                                  | Cold start on Railway free tier                                    | Either upgrade Railway plan, or set up an external uptime monitor (UptimeRobot) to hit the backend every 10 min      |

---

## 10. Summary cheat-sheet

```
                    Smart WorkLog AI on Vercel + Railway
        ┌─────────────────────────────────────────────────────────┐
        │  Vercel        → React frontend at worklog.example.com  │
        │  Railway       → FastAPI backend at api.worklog.example │
        │  Atlas         → MongoDB free M0 (512 MB)               │
        │  Backblaze B2  → Attachments S3-compatible              │
        │  Gemini        → Direct Google API (your key)           │
        │  Telegram      → Webhook → Railway URL                  │
        │  Make.com      → Same as before, just new URLs          │
        └─────────────────────────────────────────────────────────┘
                                  │
                Monthly cost: $0 (free tier) → ~$5–10/month (hobby)
                No Emergent runtime dependencies
                No long-term lock-in — every piece is standard OSS
```

---

## Related docs

| Doc                                          | Purpose                                                            |
| -------------------------------------------- | ------------------------------------------------------------------ |
| [`README.md`](./README.md)                   | Full architecture, API reference, RBAC matrix                      |
| [`MIGRATION.md`](./MIGRATION.md)             | Self-hosted VPS migration (Pattern C)                              |
| [`KEYS_AND_ENV.md`](./KEYS_AND_ENV.md)       | Every secret in one private file (with real values)                |
| [`DEPLOYMENT.md`](./DEPLOYMENT.md)           | Emergent-specific deployment notes                                 |
| [`PLAYSTORE_UPLOAD.md`](./PLAYSTORE_UPLOAD.md) | Android APK build kit + Play Store path                          |

---

*If you decide to pursue Pattern B (full Vercel serverless) instead, ask me and I'll generate a separate file-by-file refactoring guide. It's a 2–3 day effort and would benefit from a dedicated planning session.*
