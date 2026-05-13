# Smart WorkLog AI — Google Play Internal Testing Upload Guide

Complete, step-by-step walkthrough to get the app from your laptop into your team's hands via Google Play's **Internal Testing** track. End-to-end: **~30–45 minutes the first time**, ~5 minutes for every subsequent release.

> **Why Internal Testing?** Up to 100 testers, no review wait time (~hours, not days), no policy review needed. Perfect for a private workforce tool.

---

## Prerequisites — one-time

| Need                                  | Where                                                                | Cost     |
| ------------------------------------- | -------------------------------------------------------------------- | -------- |
| Google Play Developer account         | https://play.google.com/console/signup                               | **$25** (one-time, lifetime) |
| Verified payment method               | Required to create a developer account                               | —        |
| A laptop with internet + ~3 GB free   | Mac / Linux / WSL on Windows                                         | —        |
| Java JDK 17                           | `brew install openjdk@17` or `apt install openjdk-17-jdk`            | Free     |
| Node 18+                              | `brew install node` or `nvm install 18`                              | Free     |
| Your team's tester emails             | Google accounts of people who will install the app                   | —        |

The Android SDK is **automatically downloaded by Bubblewrap** on first run — no manual setup.

---

## Phase 1 — Build the AAB on your laptop (~10 min first time)

The repo already contains an Android build kit:

```
/app/android/
├── twa-manifest.json    # Pre-configured for Smart WorkLog
└── build.sh             # One-command build script
```

```bash
# On your laptop, after cloning the repo:
cd android
chmod +x build.sh
./build.sh
```

Bubblewrap will:
1. Install itself globally via npm
2. Download the Android SDK build-tools + platform-tools (~600 MB, first run only)
3. Prompt you for:
   - **Keystore password** → choose a strong one and SAVE IT in a password manager. If you lose it, Google Play will not let you publish updates to this app, ever.
   - **Key alias password** → same advice
   - **Country / organisation** → for the certificate metadata
4. Produce three files in `/app/android/`:
   - `app-release-bundle.aab` ← **upload this to Play Console**
   - `app-release-signed.apk` ← optional, for direct sideload
   - `android.keystore` ← **back this up** somewhere safe (you need it for every future update)

Then capture the SHA-256 fingerprint so the TWA verifies as a real native app:

```bash
bubblewrap fingerprint
# Look for the line:  SHA-256 fingerprint:  A1:B2:C3:....
```

---

## Phase 2 — Publish the digital asset link (~5 min)

This is what tells Android "yes, this signed APK is allowed to open this web domain in fullscreen mode".

1. Open `/app/frontend/public/.well-known/assetlinks.json`
2. Replace `REPLACE_WITH_SHA256_FROM_BUBBLEWRAP_FINGERPRINT_OUTPUT` with the SHA-256 from the previous step (keep the colons).
3. Commit & redeploy the frontend (via Emergent's Save to GitHub + Deploy, or whatever your CI does).
4. Verify it's live:
   ```bash
   curl https://task-intelligence-13.emergent.host/.well-known/assetlinks.json
   ```
   The response must show your SHA-256 (no error pages, no auth wall).

> If you skip this step, the app still installs and runs, but the browser address bar will be visible at the top — it won't feel native. Adding the assetlinks is the difference between "PWA shortcut" and "real Android app".

---

## Phase 3 — Create the app in Play Console (~10 min, one-time)

1. Go to https://play.google.com/console → **Create app**
2. Fill in:
   - **App name**: `Smart WorkLog AI` (max 30 chars)
   - **Default language**: English (United States)
   - **App or game**: App
   - **Free or paid**: Free
   - Accept the **Developer Program Policies** + **US export laws**
3. Click **Create app** → you're in your app's dashboard.

### Quick setup checklist (Play Console will prompt you for each)

| Section                          | What to enter                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **App access**                   | "All functionality is available without special access" (or provide a demo account if Play asks)        |
| **Ads**                          | No                                                                                                     |
| **Content rating**               | Run the questionnaire → choose **Productivity** → answer "No" to all sensitive content questions → submit |
| **Target audience**              | 18+ (it's a workforce tool)                                                                            |
| **News app**                     | No                                                                                                     |
| **Data safety**                  | See template below 👇                                                                                  |
| **Government apps**              | No                                                                                                     |
| **Financial features**           | No                                                                                                     |
| **Health**                       | No                                                                                                     |
| **App category**                 | Productivity → Business                                                                                |
| **Store listing**                | See template below 👇                                                                                  |

### Data safety form (copy-paste)

| Data collected                           | Purpose            | Required? | Shared with 3rd party? |
| ---------------------------------------- | ------------------ | --------- | ---------------------- |
| Email address                            | Account management | Yes       | No                     |
| Name                                     | Account management | Yes       | No                     |
| User-generated content (daily updates)   | App functionality  | Yes       | No                     |
| Photos / files (attachments)             | App functionality  | Optional  | No                     |
| Device or other IDs (for session)        | App functionality  | Yes       | No                     |

Encryption in transit: **Yes** (all backend traffic over HTTPS).
Encryption at rest: **Yes** (MongoDB managed by Emergent).
Users can request deletion: **Yes** — GDPR purge available via HR.

### Store listing (copy-paste)

- **Short description (80 chars)**:
  ```
  AI-powered workforce daily updates, priority escalation and team intelligence.
  ```
- **Full description (4000 chars)**:
  ```
  Smart WorkLog AI is the all-in-one workforce management platform that turns daily team check-ins into real intelligence.

  CORE FEATURES
  • Free-text daily updates — Gemini AI extracts mood, urgency and a one-line summary
  • Priority escalation with mandatory reason and "requires sacrifice" workflow
  • 6-role RBAC: Super Admin, HR, Supervisor, Developer, Team Member, Employee
  • Two-way Telegram bot — create tasks, request leave, get team status from chat
  • Jira one-way sync for developers
  • Leave management with supervisor / HR approval
  • Streaks, badges and weekly leaderboard
  • Multi-language: English, Hindi, Arabic, Urdu, Bangla, French, Swahili
  • Light / dark mode that follows your phone's setting
  • Works offline — your updates queue and sync when back online

  PERFECT FOR
  • Distributed engineering teams
  • Operations teams needing daily situational awareness
  • HR teams wanting always-on workforce mood and compliance audit

  PRIVACY
  Every workspace is isolated. Your data never leaves your company's tenant. GDPR right-to-delete is built in — HR can permanently purge any user with a single click.
  ```
- **App icon**: upload `/app/frontend/public/logo512.png` (512×512 PNG)
- **Feature graphic**: 1024×500 PNG — create a simple branded banner (the dark-mode dashboard screenshot works great)
- **Screenshots**: at least 2 phone screenshots (e.g. `/tmp/dark_jira.png`, `/tmp/dark_dashboard.png` from this session) — Play recommends 4–8

---

## Phase 4 — Create Internal Testing release (~5 min)

1. In Play Console → left sidebar → **Testing → Internal testing**
2. Click **Create new release**
3. **App signing**: accept the default (Play App Signing — Google manages the upload key separately from your release key)
4. **App bundles**: drag & drop `app-release-bundle.aab` from `/app/android/`
5. **Release name** auto-fills to "1 (1.0.0)" — keep it
6. **Release notes**:
   ```
   First internal release — Smart WorkLog AI v1.0.0
   • Full PWA wrapped as a Trusted Web Activity
   • Auto-updates from the web app on next launch
   • Reports any bugs via in-app feedback or to engineering@yourcompany.com
   ```
7. Click **Save** → **Review release** → **Start rollout to Internal testing**.
8. Status will be "In review" for ~15–30 minutes (much faster than production review). When it switches to "Available to internal testers", proceed to Phase 5.

---

## Phase 5 — Invite testers (~2 min)

1. Same screen → **Testers** tab
2. **Create email list** → name it "WorkLog internal" → paste tester Google account emails (one per line, max 100)
3. Save → toggle the list **On**
4. Copy the **opt-in URL** that Play generates — looks like `https://play.google.com/apps/internaltest/123456789...`
5. Send the opt-in URL to your testers. They:
   - Tap the link on their Android device
   - Tap **Become a tester**
   - Tap **Download it on Google Play** → app installs from Play Store

The app now appears in their **Play Store → Apps & games → Library** under "Beta apps".

---

## Phase 6 — Push updates (~3 min, every time)

For every code/UI change you ship:

1. On your laptop:
   ```bash
   cd /app/android
   # Bump appVersionCode in twa-manifest.json (e.g. 1 → 2 → 3)
   ./build.sh
   ```
2. Upload the new `app-release-bundle.aab` to Play Console → Internal testing → Create new release.
3. Testers get an auto-update notification within ~hours.

> **For pure web/UI changes**, you do **not** need to rebuild — the TWA loads the live site, so a frontend deploy alone updates what users see on next launch. Only rebuild when `manifest.json`, the package name, the target SDK, or app icons change.

---

## Promoting to Production (optional)

When ready to publish to the world:

1. Play Console → **Production** track
2. Click **Promote release** on your Internal testing release → choose Production
3. **Production reviews take 2–7 days** the first time (much faster afterward)
4. App appears in the public Google Play Store searchable globally

You can skip Internal Testing entirely and go straight to Production, but Internal is highly recommended for at least one cycle to catch device-specific issues.

---

## Troubleshooting

| Symptom                                                | Fix                                                                                                |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Browser address bar shows at top of app                | `assetlinks.json` not reachable. Re-check Phase 2 step 4.                                          |
| "App not installed" after sideloading the APK           | Your phone already has a different-signed version → uninstall first.                               |
| Play rejected with "INSTALL_FAILED_VERSION_DOWNGRADE"  | Bump `appVersionCode` in `twa-manifest.json` before rebuilding.                                    |
| Can't open the app — splash then close                 | TWA can't reach the URL. Test the URL in Chrome on the same device first.                          |
| Lost the keystore file                                 | Use Play App Signing recovery flow → Google can issue a key reset, takes ~3 days.                  |
| Want to test on a real device without uploading to Play | Run `adb install app-release-signed.apk` (with USB debugging enabled).                             |

---

## Files generated in this repo

| File                                                       | Purpose                                                                                  |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `/app/android/twa-manifest.json`                           | Bubblewrap config — pre-filled for Smart WorkLog                                         |
| `/app/android/build.sh`                                    | One-command build script                                                                 |
| `/app/frontend/public/.well-known/assetlinks.json`         | Domain ↔ APK verification (paste your SHA-256 here)                                      |
| `/app/PLAYSTORE_UPLOAD.md`                                 | This document                                                                            |

---

## What I couldn't do for you

Some steps **must happen on your side**:

- ❌ **Create the Google Play Developer account** — requires your identity, credit card, and Google login.
- ❌ **Generate the signing keystore** — must be done on a machine *you* control, because the private key is the only thing standing between your app and someone hijacking your Play Store listing. The keystore file lives on your laptop, never on a shared cloud container.
- ❌ **Upload the AAB** — Google Play Console is a manual UI; the Play Developer API exists but needs additional service-account permissions you'd need to provision.
- ❌ **Distribute the opt-in link to testers** — that's a comms decision.

Everything else (manifest, icons, copy, scripts, assetlinks template, release notes, data-safety form) is ready to go.
