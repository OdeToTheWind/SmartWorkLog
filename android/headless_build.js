#!/usr/bin/env node
/* Smart WorkLog AI - non-interactive Bubblewrap TWA generator
   Uses @bubblewrap/core directly to skip the CLI prompts. */
const path = require('path');
const fs = require('fs');

// Resolve core from the globally installed CLI
const corePath = '/usr/lib/node_modules/@bubblewrap/cli/node_modules/@bubblewrap/core/dist/lib';
const { TwaGenerator } = require(corePath + '/TwaGenerator');
const { TwaManifest } = require(corePath + '/TwaManifest');
const { Config } = require(corePath + '/Config');
const { JdkHelper } = require(corePath + '/jdk/JdkHelper');
const { AndroidSdkTools } = require(corePath + '/androidSdk/AndroidSdkTools');
const { GradleWrapper } = require(corePath + '/GradleWrapper');
const { Log } = require(corePath + '/Log');

const PROJECT_DIR = '/app/android/build_out';
const MANIFEST_PATH = '/app/android/twa-manifest.json';
const KEYSTORE_PATH = '/app/android/android.keystore';
const KEYSTORE_PASS = 'worklog2026';
const KEY_ALIAS = 'android';

const log = new Log('worklog-build');

(async () => {
  try {
    // Ensure project dir exists
    fs.mkdirSync(PROJECT_DIR, { recursive: true });

    // Load TwaManifest from local JSON (skip URL fetch entirely)
    const tm = await TwaManifest.fromFile(MANIFEST_PATH);
    // Override signing key location
    tm.signingKey = { path: KEYSTORE_PATH, alias: KEY_ALIAS };
    console.log('Loaded TwaManifest:', tm.packageId, '→', tm.host);
    console.log('Icon:', tm.iconUrl);

    // Generate the Android project files
    const gen = new TwaGenerator();
    await gen.createTwaProject(PROJECT_DIR, tm, log);
    console.log('✓ TWA project generated at', PROJECT_DIR);

    // Save the manifest into the project
    await tm.saveToFile(path.join(PROJECT_DIR, 'twa-manifest.json'));
    console.log('✓ twa-manifest.json saved');

    // Build the project with Gradle to produce APK + AAB
    const config = await Config.loadConfig('/root/.bubblewrap/config.json');
    const jdkHelper = new JdkHelper(process, config);
    const androidSdkTools = await AndroidSdkTools.create(process, config, jdkHelper, log);
    const gradleWrapper = new GradleWrapper(process, androidSdkTools, PROJECT_DIR);

    console.log('Running: gradle assembleRelease …');
    await gradleWrapper.assembleRelease();
    console.log('✓ APK assembled');

    console.log('Running: gradle bundleRelease …');
    await gradleWrapper.bundleRelease();
    console.log('✓ AAB bundled');

    // Sign the APK
    const apkPath = path.join(PROJECT_DIR, 'app/build/outputs/apk/release/app-release-unsigned.apk');
    const aabPath = path.join(PROJECT_DIR, 'app/build/outputs/bundle/release/app-release.aab');
    const signedApk = path.join(PROJECT_DIR, 'app-release-signed.apk');
    const signedAab = path.join(PROJECT_DIR, 'app-release-bundle.aab');

    console.log('Signing APK with apksigner…');
    await androidSdkTools.apksigner(KEYSTORE_PATH, KEYSTORE_PASS, KEY_ALIAS, KEYSTORE_PASS, apkPath, signedApk);
    console.log('✓ Signed APK at', signedApk);

    // Sign AAB with jarsigner via jdkHelper
    console.log('Signing AAB with jarsigner…');
    const { spawn } = require('child_process');
    await new Promise((resolve, reject) => {
      const j = spawn(path.join(jdkHelper.getJavaHome(), 'bin/jarsigner'), [
        '-verbose',
        '-sigalg', 'SHA256withRSA',
        '-digestalg', 'SHA-256',
        '-keystore', KEYSTORE_PATH,
        '-storepass', KEYSTORE_PASS,
        '-keypass', KEYSTORE_PASS,
        '-signedjar', signedAab,
        aabPath, KEY_ALIAS,
      ], { stdio: 'inherit' });
      j.on('exit', (c) => c === 0 ? resolve() : reject(new Error('jarsigner exit ' + c)));
    });
    console.log('✓ Signed AAB at', signedAab);

    // Copy to /app/android/ for easy access
    fs.copyFileSync(signedApk, '/app/android/app-release-signed.apk');
    fs.copyFileSync(signedAab, '/app/android/app-release-bundle.aab');
    console.log('\n========== BUILD COMPLETE ==========');
    console.log('APK: /app/android/app-release-signed.apk');
    console.log('AAB: /app/android/app-release-bundle.aab');
    console.log('Keystore: /app/android/android.keystore (password: worklog2026)');
  } catch (e) {
    console.error('BUILD FAILED:', e.message || e);
    if (e.stack) console.error(e.stack);
    process.exit(1);
  }
})();
