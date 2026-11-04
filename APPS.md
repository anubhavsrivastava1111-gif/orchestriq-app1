# OrchestrIQ Apps — Android & Desktop

OrchestrIQ now ships as:

| Platform | File you get | Folder |
|---|---|---|
| Android phone / tablet (Android 7+) | `.apk` (and `.aab` for Play Store) | `mobile/` |
| Windows 10/11 | `Setup .exe` installer + portable `.exe` | `desktop/` |
| macOS (Intel + Apple Silicon) | `.dmg` | `desktop/` |
| Linux | `.AppImage` | `desktop/` |

## How it works (and why)

Both apps open the live site **https://orchestriq.gorakhai.com** inside a native app window.

- **Why not bundle the website inside the app?** The backend (`functions/api/*`) only accepts
  requests from `https://orchestriq.gorakhai.com`, and Supabase login/password-reset redirect
  back to that address. A bundled copy would break AI calls and login.
- **Benefit:** every website deploy reaches app users instantly. You only rebuild the apps when
  the app shell itself changes (icon, name, permissions).

What the apps add on top of the website:

| | Android | Desktop |
|---|---|---|
| Own icon, launcher entry, full-screen window | ✅ | ✅ |
| Exports (Excel, CSV, Word, PDF, images) saved to **Downloads** | ✅ (native bridge) | ✅ (Save dialog) |
| Microphone for voice input (asks permission once) | ✅ | ✅ |
| File upload (Data Ingestion etc.) | ✅ | ✅ |
| Back button walks back through pages | ✅ | Alt+← / Cmd+[ |
| Links to other sites open in the normal browser | ✅ | ✅ |
| "You're offline" screen with auto-retry | ✅ | ✅ |
| Remembers window size/position, single instance | — | ✅ |

## Step 1 — Get the installable files (no software needed)

The apps are built automatically by GitHub every time `mobile/`, `desktop/` or the workflow changes.

1. Open the repository on GitHub → **Actions** tab.
2. Click **Build apps** in the left list. (To build on demand: **Run workflow** → **Run workflow**.)
3. Open the latest run with a green tick ✅.
4. Scroll to **Artifacts** and download `OrchestrIQ-android`, `OrchestrIQ-Windows`,
   `OrchestrIQ-macOS` or `OrchestrIQ-Linux` (each is a `.zip` — unzip it).

## Step 2 — Install

**Android**
1. Send the `.apk` to the phone (Google Drive, WhatsApp to yourself, USB).
2. Tap it → Android asks to *allow installing from this source* → allow → **Install**.
3. Updates: install the newer `.apk` over the old one — the login is kept.

**Windows**
1. Run `OrchestrIQ-…-win-x64.exe`.
2. Windows SmartScreen will say *"Windows protected your PC"* (because the app is not yet
   code-signed) → **More info** → **Run anyway**.

**macOS**
1. Open the `.dmg`, drag OrchestrIQ to Applications.
2. First launch: right-click the app → **Open** → **Open** (the app is not yet notarized by Apple).
   On recent macOS versions you may instead need *System Settings → Privacy & Security → Open Anyway*.

**Linux**
1. `chmod +x OrchestrIQ-*.AppImage`, then double-click it.

## Step 3 — Publishing to stores (when ready)

These cost money / paperwork, so they are optional and not done yet:

| Goal | What you need | Cost (approx.) |
|---|---|---|
| Google Play Store | Play Console account + signing key (below) + upload the `.aab` | US$25 one-time |
| No SmartScreen warning on Windows | Code-signing certificate (OV/EV) | ~US$200–500 / year |
| No warning on macOS | Apple Developer Program + notarization | US$99 / year |

**Android signing key (needed for Play Store and for stable updates)** — do this once:

```bash
keytool -genkey -v -keystore orchestriq-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias orchestriq
```

```bash
base64 -w0 orchestriq-release.jks > keystore.txt
```

Then in GitHub → **Settings → Secrets and variables → Actions → New repository secret**, add:

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | contents of `keystore.txt` |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password you chose |
| `ANDROID_KEY_ALIAS` | `orchestriq` |
| `ANDROID_KEY_PASSWORD` | the key password you chose |

From the next run, the Android artifact also contains a signed `OrchestrIQ-x.y.z.apk` and
`OrchestrIQ-x.y.z.aab`. **Back up the `.jks` file and passwords** — if lost, the Play Store
listing can never be updated with the same key.

Note: Google Play may reject apps that are only a website in a frame. The native download,
microphone, back-button and offline features help, but plan for a store review.

## Known limitations

- **Internet required.** The apps show an offline screen when there is no connection.
- **Speech-to-text** that relies on the browser's built-in speech recognition (`webkitSpeechRecognition`)
  is not available inside Android WebView or Electron. Features that record audio with the microphone
  and send it to an AI provider do work. Read-aloud depends on the voices installed on the device.
- Password-reset emails open in the phone/computer's default browser, not the app.

## For developers — build locally

Android (needs Android Studio / Android SDK and JDK 21):

```bash
cd mobile && npm install && npx cap sync android && npx cap open android
```

Desktop (needs Node 22):

```bash
cd desktop && npm install && npm start
```

```bash
cd desktop && npm run dist
```

Key files:

- `mobile/capacitor.config.json` — app id, live URL, allowed in-app hosts, status-bar style.
- `mobile/android/app/src/main/java/com/gorakhai/orchestriq/MainActivity.java` — back button,
  download bridge, DownloadManager.
- `desktop/main.js` — window, link handling, permissions, downloads, menu, offline screen.
- `.github/workflows/build-apps.yml` — cloud builds.
