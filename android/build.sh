#!/usr/bin/env bash
# Smart WorkLog AI — Android AAB build script
# Run this on your local machine (macOS / Linux / WSL) with internet access.
# Prerequisites:
#   - Node 18+      (you almost certainly have this)
#   - Java JDK 17   (brew install openjdk@17  /  apt install openjdk-17-jdk)
#   - Android SDK   (Bubblewrap will offer to install it on first run)
# Outputs:
#   - app-release-bundle.aab  ← upload this to Google Play Console
#   - app-release-signed.apk  ← for sideload / internal testing without Play
#   - android.keystore        ← KEEP THIS FILE FOREVER (cannot replace once published)
set -euo pipefail

echo "==> Installing Bubblewrap CLI globally"
npm i -g @bubblewrap/cli@latest

cd "$(dirname "$0")"

if [[ ! -f android.keystore ]]; then
  echo "==> First-time setup: bubblewrap will create your signing key"
  echo "    SAVE the keystore password and keypassword you choose now — Play Store cannot replace this key later."
  bubblewrap init --manifest=./twa-manifest.json
else
  echo "==> Existing keystore detected — bumping version & building"
  bubblewrap update --manifest=./twa-manifest.json
fi

echo "==> Building release AAB + APK"
bubblewrap build

echo
echo "==> Done. Files produced:"
ls -lh app-release-bundle.aab app-release-signed.apk android.keystore 2>/dev/null || true
echo
echo "==> Next steps:"
echo "  1. Run:   bubblewrap fingerprint"
echo "     Copy the SHA-256 fingerprint."
echo "  2. Paste that fingerprint into:"
echo "       /app/frontend/public/.well-known/assetlinks.json"
echo "     (replace REPLACE_WITH_SHA256_FROM_BUBBLEWRAP_FINGERPRINT_OUTPUT)"
echo "  3. Redeploy the frontend so the file is reachable at:"
echo "       https://task-intelligence-13.emergent.host/.well-known/assetlinks.json"
echo "  4. Upload app-release-bundle.aab to Google Play Console → Internal testing."
echo "  5. See /app/PLAYSTORE_UPLOAD.md for the full submission walkthrough."
