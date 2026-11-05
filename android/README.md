# Lifeline for Android

A native Android app (package `com.orchestriq.lifeline`) that hosts the Lifeline interface in a locked-down WebView and adds native features:
- real EMI reminder notifications;
- fingerprint unlock backed by the Android Keystore;
- screenshot blocking;
- hand-off to AI, UPI and broker apps;
- secure file save and open.

- **Size:** ~0.3 MB · **Android:** 8.0+ (API 26), targets Android 15 (API 35)
- **Permissions:** Internet, Notifications, Run at startup (to restore reminders after a reboot), Biometric. No contacts, SMS, location, storage or camera.

## Install on your phone (sideload)

1. Copy `Lifeline.apk` to your phone, or download it there.
2. Tap it. Android asks to **allow installs from this source**. Allow it for your browser or file manager, then tap **Install**.
3. If **Play Protect** warns "unknown developer", tap **More details → Install anyway**. This happens for any app not yet on the Play Store.
4. Open **Lifeline**, create your 6-digit passcode, and turn on fingerprint unlock if you want it.
5. Allow notifications when asked (or More → EMI reminders → Allow phone notifications).

To **update**, install a newer `Lifeline.apk` over the old one. Your data stays, as long as the new APK is signed with the **same key** (see "Signing key").

## Updating to a new version (keeps all your data)

1. **Save an encrypted backup first** (More → Save encrypted backup). It isn't required, but it's good practice before any update.
2. Open the new `Lifeline-x.y.z.apk` on the phone and tap **Update**. Do **not** uninstall the old app first: uninstalling deletes its data.
3. Open Lifeline and unlock with your usual passcode. Everything is still there.

This works because every release is signed with the same key and has a higher version number. Android then replaces the app but keeps its private storage (the encrypted vault and the hardware key).

| Version | Code | What's new |
|---|---|---|
| 1.0.0 | 1 | First Android release |
| 1.2.0 | 3 | Grow tab: goal planner (inflation, 3 plans, 80%-confidence amounts from 2,000 simulated markets), "next rupee" priority ladder, risk quiz (capped under debt stress), fund/stock research (returns over 1/3/5/10 years, biggest fall, rolling returns, SIP backtest, scenarios from the fund's own history), watchlist, research-site links, AI analysis; wrong-passcode alert at unlock |
| 1.1.0 | 2 | Detailed credit cards: EMIs on the card (principal, interest, GST, processing fee), automatic statement and minimum due, card cash (ATM / app transfers) cost calculator, one-tap upgrade of old credit-card entries |

## Security model

| Layer | What protects you |
|---|---|
| Data at rest | All app data is AES-256-GCM encrypted. The data key is wrapped by a key derived from your passcode (PBKDF2-SHA256, 310,000 rounds), then sealed again with a non-exportable **Android Keystore** key. A copy of the storage taken off the phone can't be decrypted or brute-forced elsewhere. |
| Unlock | 6-digit passcode with escalating lockouts (5 tries, then 30 s doubling up to 1 h). Optional fingerprint/face uses a separate Keystore key that requires a strong biometric for every use. It is **invalidated if fingerprints change**, so someone who knows your phone PIN can't add their own finger. |
| While running | Auto-lock after 0–5 minutes in the background (your choice). `FLAG_SECURE` blocks screenshots, screen recording and recent-apps previews. "Hide amounts" privacy mode. |
| The app container | Interface ships inside the APK and is served from a reserved offline origin. A strict Content-Security-Policy allows scripts only from the app and network only to `api.anthropic.com`, `api.mfapi.in` and `www.alphavantage.co`. The WebView can't open other sites, `file://` or `content://`. External links go to the browser; only https/tel/mailto/upi are allowed. |
| Native bridge | Works only while the app's own origin is loaded. App hand-off is limited to a fixed list of known packages. The native HTTP helper only reaches two market-data hosts. |
| Backups | Android cloud/adb backup is **disabled**. Your own backups are AES-256 encrypted with a separate password and saved through the system file picker. Lifeline needs no storage permission. |
| Notifications | Lock-screen version shows only "You have an EMI reminder". Amounts appear after unlocking the phone. |
| AI | Summaries sent to AI apps never include your name, account numbers or keys, and you choose rounded, exact or hidden amounts. Your own Claude API key is stored inside the encrypted vault. |

**Known limits**
- On a rooted or compromised phone, a determined attacker who watches you type your passcode can read your data. No app can fully prevent that.
- If you forget your passcode, the data can't be recovered (by design). Keep an encrypted backup.

## Build it yourself

```bash
sudo apt-get install aapt zipalign apksigner dalvik-exchange android-sdk-platform-23
```

```bash
mkdir -p /opt/lifeline-tools && curl -o /opt/lifeline-tools/android-all-35.jar https://repo.maven.apache.org/maven2/org/robolectric/android-all/15-robolectric-12650502/android-all-15-robolectric-12650502.jar
```

```bash
LIFELINE_KS_PASS='your-keystore-password' ./android/build-apk.sh
```

Output: `android/build/Lifeline.apk`. The script:
1. builds the interface with `vite.android.config.ts`;
2. compiles the Java code (no third-party libraries);
3. refuses any lambda bytecode that older Android versions can't run;
4. converts, packages, aligns and signs with APK Signature Scheme v2 and v3.

### Tests
- `android/test-native/run-tests.sh` runs the real native code under Robolectric (Android 15 framework on the JVM).
- The web interface is tested end to end with Playwright, in web mode and in "Android mode": the exact files packaged in the APK, served with the app's security policy, with the native bridge simulated.

## Signing key

- Release builds are signed with `lifeline-release.jks` (RSA 4096, valid until 2054).
- **Keep it and its password safe and private, and never commit them.** Every future update must be signed with the same key, or phones will refuse to install it over the existing app.
- For Google Play, enrol in **Play App Signing**. Google then holds the app-signing key, and this key becomes your *upload key*, which can be reset if lost.

## Publishing on Google Play (next phase)

Play requires an **Android App Bundle (.aab)** built with Google's toolchain. That toolchain couldn't be downloaded in the build environment used here, so this APK is for direct install. To publish:

1. Install Android Studio. Create an empty "No Activity" project with package `com.orchestriq.lifeline`, minSdk 26 and target SDK as Play currently requires.
2. Copy `app/src/main` (manifest, `java/`, `res/`) over the new project's `app/src/main`. Run `npx vite build --config vite.android.config.ts` to fill `assets/www`.
3. **Build → Generate Signed App Bundle**, using `lifeline-release.jks` as the upload key.
4. In Play Console: create the app → **Data safety** ("No data collected": everything stays on the device; data sent to AI apps or Anthropic happens only at the user's request, under the user's own account) → **Financial features** declaration (budgeting/tracking, no lending) → privacy policy URL → closed testing (Play requires 12 testers for 14 days on new personal developer accounts) → production.
5. Subscriptions: add **Google Play Billing** (products `lifeline_pro_monthly` at ₹149 and `lifeline_pro_yearly` at ₹999). Set `settings.plan` from the verified purchase (`src/money/entitlements.ts`). Verify purchases on a small server (Play Developer API) before trusting them.
