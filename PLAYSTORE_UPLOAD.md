# Smart WorkLog AI — Android APK & Optional Play Store Guide

Two distribution paths covered in this doc:

1. **Direct APK distribution (current chosen path)** — Build the signed APK on your laptop, share it directly with your team. **No Google Play account required, no $25 fee, no review wait.** Skip to [Direct APK distribution](#direct-apk-distribution).
2. **Google Play Internal Testing (optional, for the future)** — If you ever want managed distribution + auto-updates via the Play Store. Skip to [Google Play Internal Testing](#google-play-internal-testing).

> Both paths share the same build kit at `/app/android/`. The only difference is what you do with the produced `.aab` / `.apk` files.

---

## Direct APK distribution

This is the path you're using right now. The team installs the APK like any sideloaded Android app — Slack/WhatsApp/Drive distribution, no Play Store involvement.

### Prerequisites — one-time

| Need                                  | Where                                                                | Cost |
| ------------------------------------- | -------------------------------------------------------------------- | ---- |
| A laptop with internet + ~3 GB free   | Mac / Linux / WSL on Windows                                         | —    |
| Java JDK 17                           | `brew install openjdk@17` or `apt install openjdk-17-jdk`            | Free |
| Node 18+                              | `brew install node` or `nvm install 18`                              | Free |

The Android SDK is **auto-downloaded by Bubblewrap** on first run — no manual setup.

### Phase 1 — Build the APK on your laptop (~10 min first time, ~2 min thereafter)

```bash
cd /app/android
chmod +x build.sh
./build.sh
```

First-time prompts:
- **Keystore password** → choose a strong one and SAVE IT in a password manager. **If you lose it, you cannot publish updates to this app — every user has to uninstall first and reinstall a new APK signed with a different key.**
- **Key alias password** → same advice
- **Country / organisation** → for the certificate metadata

Output files in `/app/android/`:
- `app-release-signed.apk` ← **this is what you send to your team**
- `app-release-bundle.aab` ← only needed if you later decide to publish to Play Store; ignore for now
- `android.keystore` ← **back this up** (Drive, Bitwarden, secure cloud). Without this file, you cannot release updates.

### Phase 2 — Optional: publish asset-link for fullscreen mode

If you skip this step, the APK still installs and runs, but Android will show the browser address bar at the top of the app — it'll feel slightly less native. Adding `assetlinks.json` upgrades it to true fullscreen.

```bash
# On your laptop after the build:
bubblewrap fingerprint
# Look for the SHA-256:  A1:B2:C3:....
```

1. Open `/app/frontend/public/.well-known/assetlinks.json`
2. Replace `REPLACE_WITH_SHA256_FROM_BUBBLEWRAP_FINGERPRINT_OUTPUT` with the SHA-256 (keep the colons)
3. Redeploy the frontend (via Emergent's Save to GitHub + Deploy, or your own CI)
4. Verify it's reachable:
   ```bash
   curl https://task-intelligence-13.emergent.host/.well-known/assetlinks.json
   ```

### Phase 3 — Distribute the APK to your team

Pick any of these — they all work the same:

| Method                  | How                                                                                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Google Drive**        | Upload the APK → right-click → Share → "Anyone with the link" → send link to team. Each person taps it on their phone → "Download" → "Open"     |
| **Dropbox / OneDrive**  | Same as above                                                                                                                                  |
| **File server**         | `scp` the APK to your nginx-served directory → share `https://your-domain.com/worklog.apk`                                                     |
| **Email attachment**    | Many email providers strip APK attachments — Gmail does. Use Drive instead.                                                                    |
| **WhatsApp / Slack DM** | Drag the APK into a chat. WhatsApp may rename to `.zip` — instruct testers to rename back to `.apk` or right-click → "Save as worklog.apk"     |
| **QR code**             | Generate a QR pointing to the Drive/Dropbox link → print or display on a TV → team scans with their phone camera                               |

### Phase 4 — Team install instructions (send this verbatim)

> 1. Tap the **worklog.apk** download link on your Android phone.
> 2. Open the file. Android will ask: "Allow this source to install apps?" → tap **Settings** → toggle **Allow** → back out.
> 3. Tap **Install**. The "Smart WorkLog" icon appears on your home screen.
> 4. Open the app → sign in with the credentials your HR sent.
> 5. *(Optional)* Long-press the home-screen icon for shortcuts to **Daily Update** and **My Tasks**.
>
> When a new version comes out, just install the new APK over the old one — your data stays.

### Phase 5 — Push updates to your team

When you ship a new version:

1. Edit `/app/android/twa-manifest.json`:
   - Bump `appVersionCode`: `1` → `2` → `3` (must always increase)
   - Optionally bump `appVersion`: `1.0.0` → `1.0.1`
2. Run `./build.sh` again — same keystore is reused automatically
3. Send the new `app-release-signed.apk` to your team
4. They tap it, "Install" (it replaces the old version), open the app — their session stays signed in.

> **You do NOT need to rebuild the APK for pure web/UI changes.** The TWA loads the live URL, so any frontend deploy automatically updates what users see on the app's next launch. Only rebuild when:
> - You change `manifest.json` substantially
> - You bump the Android target SDK
> - You add new app shortcuts in `twa-manifest.json`
> - You rotate the signing key (rare)

### Troubleshooting (sideload)

| Symptom                                                | Fix                                                                                                |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| "App not installed" after tapping the APK              | Phone already has an older version signed with a different key. Uninstall it first.                |
| Phone says APK is corrupted                            | WhatsApp renamed to `.zip`. Save the file and rename to `.apk` before opening.                     |
| Browser address bar shows at top of app                | `assetlinks.json` not reachable / SHA-256 mismatch. Verify Phase 2 step 4.                         |
| Team can't find "Allow this source" toggle             | Newer Androids show it as a one-time prompt after the first tap. Just tap **Settings** when asked. |
| Want to inspect what's inside the APK                  | `unzip app-release-signed.apk` — it's a ZIP archive. `AndroidManifest.xml` is binary-encoded.      |

---

## Google Play Internal Testing

**Optional** — only follow this section if you decide later that you want Play-Store-managed distribution. Direct APK distribution above is perfectly fine for any team size.

Internal Testing on Play Store gives you:
- Up to 100 testers, no public Play Store visibility
- Auto-updates via Play Store (no need to send new APKs manually)
- ~15-min approval per release (vs. days for Production)
- Costs: **$25 one-time** for the Play Developer account

### Prerequisites

| Need                                  | Where                                                                | Cost |
| ------------------------------------- | -------------------------------------------------------------------- | ---- |
| Google Play Developer account         | https://play.google.com/console/signup                               | **$25** (lifetime) |
| Verified payment method               | Required at signup                                                   | —    |
| Your team's Google account emails     | Up to 100 for Internal Testing                                       | —    |
| All prerequisites from Direct APK distribution above (JDK 17, Node 18, etc.)                                 |      |

### Phase 1 — Build the AAB

Same as Direct APK Phase 1 — `./build.sh` produces `app-release-bundle.aab` alongside the APK. Upload the **`.aab`** to Play Console (not the `.apk`).

### Phase 2 — Publish digital asset link

Same as Direct APK Phase 2 — Play Store **requires** this for fullscreen TWA mode.

### Phase 3 — Create the app in Play Console (~10 min, one-time)

1. https://play.google.com/console → **Create app**
2. App name: `Smart WorkLog AI`, default language: English (US), App or game: **App**, Free or paid: **Free**
3. Accept policies → **Create app**
4. Fill the quick-setup checklist:

| Section          | Answer                                                                                                            |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| App access       | "All functionality is available without special access" (or provide demo creds if asked)                          |
| Ads              | No                                                                                                                |
| Content rating   | Productivity → all "No" answers → submit                                                                          |
| Target audience  | 18+                                                                                                               |
| Data safety      | See template below                                                                                                |
| App category     | Productivity → Business                                                                                           |
| Store listing    | See template below                                                                                                |

### Data safety form (copy-paste)

| Data collected                           | Purpose            | Required? | Shared? |
| ---------------------------------------- | ------------------ | --------- | ------- |
| Email address                            | Account management | Yes       | No      |
| Name                                     | Account management | Yes       | No      |
| User-generated content (daily updates)   | App functionality  | Yes       | No      |
| Photos / files (attachments)             | App functionality  | Optional  | No      |
| Device or other IDs (for session)        | App functionality  | Yes       | No      |

Encryption in transit: **Yes**. Encryption at rest: **Yes**. Users can request deletion: **Yes**.

### Store listing (copy-paste)

- **Short description (80 chars)**:
  `AI-powered workforce daily updates, priority escalation and team intelligence.`
- **Full description (4000 chars)**: see `README.md` "What it is" + "Feature list" sections — paste those.
- **App icon**: upload `/app/frontend/public/logo512.png` (512×512 PNG)
- **Feature graphic**: 1024×500 PNG (a screenshot of the dark-mode dashboard works great)
- **Screenshots**: at least 2 phone screenshots (Play recommends 4–8)

### Phase 4 — Create Internal Testing release (~5 min)

1. Play Console → **Testing → Internal testing → Create new release**
2. **App signing**: accept default (Play App Signing)
3. **App bundles**: drag in `app-release-bundle.aab`
4. **Release notes**:
   ```
   First internal release — Smart WorkLog AI v1.0.0
   • Full PWA wrapped as a Trusted Web Activity
   • Auto-updates from the web app on every launch
   ```
5. **Save → Review release → Start rollout to Internal testing**
6. Status moves to "In review" → "Available to internal testers" in ~15–30 min

### Phase 5 — Invite testers (~2 min)

1. Same screen → **Testers → Create email list**
2. Name: `WorkLog internal` → paste tester emails → save → toggle list **On**
3. Copy the **opt-in URL** Play generates → send to your team
4. Testers tap the link → **Become a tester** → install from Play Store

### Phase 6 — Push updates (~3 min, every time)

1. Bump `appVersionCode` in `twa-manifest.json`
2. `./build.sh`
3. Play Console → Internal testing → Create new release → upload new `.aab` → Save → Rollout
4. Testers get an auto-update notification within hours

### Promote to Production (optional, later)

When you've validated the app:
- Play Console → **Production → Promote release** from Internal testing
- First Production review takes 2–7 days; subsequent updates are faster
- App becomes publicly searchable on Play Store

---

## Repo files involved in the Android build

| File                                                       | Purpose                                                                                  |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `/app/android/twa-manifest.json`                           | Bubblewrap config — pre-filled for Smart WorkLog                                         |
| `/app/android/build.sh`                                    | One-command build script (APK + AAB)                                                     |
| `/app/frontend/public/.well-known/assetlinks.json`         | Domain ↔ APK verification (paste your SHA-256 here for fullscreen mode)                  |
| `/app/PLAYSTORE_UPLOAD.md`                                 | This document                                                                            |

---

## What I (the agent) cannot do for you

Some steps must happen on your side, regardless of which distribution path you pick:

- ❌ **Generate the signing keystore** — must run on a machine *you* control, because the private key is the only thing standing between your app and someone hijacking it. The keystore lives on your laptop, never on a shared cloud container.
- ❌ **Build the AAB/APK** — needs JDK 17 + Android SDK; this Emergent container doesn't have Java.
- ❌ **Distribute the APK** — that's a comms decision (Drive link / Slack / QR / etc.).
- ❌ **Pay the $25 Play fee** (only if you go down the Play Store path) — needs your card.

Everything else (manifest, build script, asset links template, release notes, store-listing copy, data-safety form) is ready in this repo.
