# Handoff: Free Koodo Reader

This document records the current state of the project, the decisions already made, and the next major goal: **Android development**.

## 1. Project Status

- Repository: https://github.com/NIyueeE/free-koodo-reader
- Default branch: `main`
- Latest release: `v3.0.1`
- CI on every push/PR to `main`: typecheck, ESLint (zero warnings), unit tests, production build, package-identifier alignment check, Android debug APK (+ renderer presence check), and a **GUI smoke test** (Electron under Xvfb, screenshot artifact).
- Release workflow: Windows + Linux desktop builds + signed Android APK, published to GitHub Releases on `v*` tags.

### Changelog for v3.0.1 (this milestone)

- **White-screen fix (root cause):** `build/` (renderer) is git-ignored, and the previous release workflow never ran `yarn build` before `electron-builder`, so packaged apps shipped without a renderer (`build/index.html`). The release workflow now builds the renderer and refuses to package if `build/index.html` is missing; CI has the same guard plus a GUI smoke test that launches the real app and verifies the renderer mounts.
- **CI/CD hardening:** added ESLint (react-app preset, `--max-warnings 0`), Jest unit tests (i18n integrity between `en.json`/`zh-CN.json`, platform detection), `scripts/smoke-test.js` + `KOODO_SMOKE_TEST` mode in `main.js`, APK renderer-presence check, and an alignment check for package identifiers (`xyz.freekoodo.reader` in desktop `appId`, `capacitor.config.ts` and Android `applicationId`).
- **Android narrow-screen adaptation:** new `src/platform/` abstraction (`isElectron` / `isCapacitor` / `isNarrowScreen` / `isMobileDevice` ...); the sidebar auto-collapses on screens ≤ 768 px, responsive header/dialog CSS (`src/assets/styles/responsive.css`); the reader engine gets `isMobile: yes` on native mobile.
- **Android signing aligned:** dedicated release keystore `android/app/keystore/free-koodo-reader.jks` with credentials in `android/app/keystore.properties`; Gradle supports CI-secret override (`ANDROID_KEYSTORE_BASE64` ...); release APKs no longer use the debug key.
- **Cleanup:** removed upstream leftovers (`upload.yml`, `release-appx.yml`, `src/upload.sh`, dead `chat-message` listener, unused imports/vars across 30+ files), fixed the `delayOnTouchStart` → invalid ReactSortable prop type errors, pinned missing Babel/privacy deps so builds and `yarn install` are warning-free.
- **Version:** 3.0.1 (`versionCode` 3001).

### Completed

- Removed all official cloud services, accounts, Pro/payment, and AI cloud features.
- Removed macOS build artifacts and Apple-specific compatibility code.
- WebDAV sync rewritten with the open-source `webdav` package; **HTTPS only**; credentials stored locally and encrypted.
- Local folder sync retained for desktop.
- System TTS / custom TTS API retained.
- Local OCR (System OCR, PaddleOCR, Tesseract) and External OCR API retained.
- Local MDX dictionary retained.
- README / AGENTS / HANDOFF / CI updated.
- Capacitor 8 scaffold added (`capacitor.config.ts` + `android/` project); `src/platform/` detection layer added.
- Android CI/CD: CI builds a debug APK + smoke-tests it; release workflow builds, signs and attaches an Android APK.
- `npx cap sync android` keeps the custom `android/app/build.gradle` signing config (no regeneration conflicts).

## 2. Current Architecture

```
Electron main process (main.js)
  ├── better-sqlite3 (SQLite)
  ├── IPC handlers (database-command, cloud-*, file system, OCR, TTS)
  └── native integrations

React renderer (src/)
  ├── React + Redux + TypeScript
  ├── CRA web build
  ├── browser-compatible reader engine (src/assets/lib)
  ├── localforage for browser storage fallback
  └── window.electronAPI bridge for desktop-only features
```

Key numbers:

- `window.electronAPI` references: ~232
- `isElectron` references: ~275
- Files using `window.electronAPI`: ~39
- `database-command` IPC references: ~27
- `localforage` references: ~31
- `public/lib` already contains web-friendly libs:
  - `sqljs-wasm` (SQLite in WASM)
  - `pdfjs`, `7z-wasm`, `libunrar`, `tesseractjs`, `onnxruntime-web`, `esearch-ocr`

This means the renderer is already largely web-compatible, but still has a significant Electron bridge that must be abstracted for Android.

## 3. Android Goal

Build an Android version of Free Koodo Reader that:

- Reuses the existing React/Redux reader and the reading engine as much as possible.
- Does **not** reintroduce official cloud services.
- Supports:
  - Local library storage
  - WebDAV sync (HTTPS only)
  - Local/custom TTS
  - Local/custom OCR (where feasible)
  - Local MDX dictionary
- Uses `free` package identifiers / signing to avoid conflict with the official app.

## 4. Codebase Analysis for Android

### 4.1 What can be reused directly

- React renderer (`src/`) — most UI and Redux logic.
- Reader engine (`src/assets/lib/kookit-extra.min.mjs`, `kookit.min.js`) — it already contains mobile WebView code (`ReactNativeWebView`), which strongly suggests the upstream mobile app uses a WebView wrapping this same engine.
- WebDAV sync (`src/utils/storage/webdavService.ts`) — browser-compatible.
- TTS plugins that call self-hosted APIs — mostly HTTP based.
- OCR libs in `public/lib` — `tesseractjs`, `onnxruntime-web` can run in a WebView.
- `public/lib/sqljs-wasm` — SQLite WASM can replace `better-sqlite3` on Android.

### 4.2 What must be replaced / abstracted

| Area | Desktop implementation | Android replacement |
|---|---|---|
| SQLite | `better-sqlite3` in Electron main via `database-command` IPC | `sql.js` WASM or Capacitor SQLite plugin |
| File system | `window.electronAPI.fs` / `path` / `os` | Capacitor Filesystem + app sandbox |
| Native dialogs | Electron `dialog` via IPC | Capacitor Dialog / File Picker |
| System OCR | Electron main process `system-ocr` | Android native OCR or Tesseract.js in WebView |
| System TTS | Electron `generate-tts` + plugins | Android TextToSpeech via Capacitor plugin or Web Speech API |
| Window / tabs | Electron `BrowserWindow` / `WebContentsView` | Single-Activity WebView, no multi-window |
| Cloud sync IPC | Electron `cloud-*` IPC | Use `webdavService.ts` directly in WebView |
| Local folder sync | Desktop path access | Android Storage Access Framework or app-private storage |
| Biometric | Windows Hello / Touch ID | Android Biometric via Capacitor plugin |
| Deep links | Electron protocol | Android App Links / custom scheme |

### 4.3 Main challenge

The biggest challenge is **not the UI**, but the **Electron bridge**:

- 232 `window.electronAPI` references
- 275 `isElectron` references
- 39 files touch the Electron bridge

A clean abstraction layer is required before Android can be built without forking the entire renderer.

## 5. Candidate Approaches

### Option A: Capacitor (Recommended)

Wrap the existing CRA web build in an Android WebView using Capacitor.

**Pros**

- Reuses the existing React/Redux/web build almost unchanged.
- Fastest path to a working Android APK.
- Rich plugin ecosystem:
  - Filesystem
  - SQLite
  - Dialog
  - Biometric
  - Text-to-Speech
  - Network
- Can keep the existing WebDAV code running in the WebView.
- Easy to also support iOS later.

**Cons**

- WebView performance is slightly below native.
- Need to replace Electron IPC with a `window.Capacitor` / plugin abstraction.
- Some desktop-only features (local folder sync, multi-window) do not map cleanly to Android.

### Option B: React Native WebView (Upstream-like)

Build a React Native shell that loads the same web app in a `WebView`.

**Pros**

- Matches the upstream mobile architecture hinted by `ReactNativeWebView` in the engine.
- Can use native modules more naturally for file/storage/TTS.
- Better native integration than Capacitor if we need deep native features.

**Cons**

- Requires a separate React Native project and native bridge code.
- More complex than Capacitor for a project that is already a CRA web app.
- Slower to first APK.

### Option C: Tauri Mobile

Use Tauri 2 mobile with a Rust backend.

**Pros**

- Smaller binary than Electron.
- Modern WebView wrapper.

**Cons**

- Requires rewriting the backend (SQLite/file/cloud) in Rust.
- Much larger migration effort.
- Not aligned with the existing JavaScript/Electron codebase.

### Option D: Full rewrite in Flutter / Kotlin

**Pros**

- Best native performance and UX.

**Cons**

- Complete rewrite; all reader logic, sync, plugins, and UI would need to be reimplemented.
- Not practical for a fork that wants to reuse the existing engine.

## 6. Recommended Approach

**Use Capacitor to wrap the existing Web build, and introduce a platform abstraction layer in the renderer.**

Phased plan:

1. **Phase 0 — Abstraction layer** (partially done)
   - `src/platform/` created with environment detection (`isElectron`, `isCapacitor`, `isAndroid`, `isNarrowScreen`, `isCompactScreen`, `isMobileDevice`) — used by the sidebar auto-collapse and the reader `isMobile` flag.
   - Remaining: full FileSystem / Database / Dialog / OCR / TTS / Cloud interfaces and Electron/Capacitor adapters, plus replacing direct `window.electronAPI` calls (still ~200+ references).

2. **Phase 1 — Capacitor scaffold** (done)
   - Add `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, and needed plugins.
   - Add `capacitor.config.ts`.
   - Configure `webDir` to `build`.
   - Create `android/` project.

3. **Phase 2 — Android platform adapter** (not started)
   - Implement `CapacitorPlatform` for filesystem, SQLite (sql.js WASM or Capacitor SQLite), TTS, OCR, dialogs.
   - Replace `isElectron` branches with `isPlatform('android')` / `isNative`.
   - Adapt storage paths to Android app sandbox.

4. **Phase 3 — Android-specific features** (not started)
   - WebDAV sync should work directly in WebView.
   - Local MDX dictionary should work via file picker / app storage.
   - TTS: use Android TextToSpeech plugin; keep custom API voices.
   - OCR: keep Tesseract.js / PaddleOCR in WebView; optionally add native OCR.
   - Remove or disable desktop-only local folder sync.

5. **Phase 4 — Package & signing** (done)
   - Set applicationId to a `free`-prefixed value, `xyz.freekoodo.reader` (done, aligned with desktop `appId`).
   - Dedicated Android signing keystore `android/app/keystore/free-koodo-reader.jks` + `android/app/keystore.properties` (done).
   - Gradle reads the keystore from `keystore.properties`, or from CI secrets (`ANDROID_KEYSTORE_BASE64` / passwords) when provided; falls back to debug signing only without either.
   - Android release workflow builds and attaches the **signed** APK (done).

6. **Phase 5 — Verification** (mostly done)
   - Web tests/typecheck/lint/build run in CI (done).
   - GUI smoke test on CI (done): renderer mounts under Xvfb; screenshot artifact.
   - Android debug APK builds in CI + renderer presence check (done).
   - Manual test on Android emulator/device (pending):
     - Import books
     - Read EPUB/PDF/TXT
     - WebDAV sync
     - TTS
     - OCR (where supported)
     - MDX dictionary

## 7. Risks

- The renderer has many Electron-specific calls; abstraction is the main cost.
- `better-sqlite3` cannot run on Android; must migrate to `sql.js` WASM or Capacitor SQLite.
- Some OCR engines may be heavy for low-end Android devices.
- Local folder sync is a desktop concept; Android will use app-private storage / SAF instead.
- The reading engine is closed-source/minified; if it has Android-specific assumptions, we can only work around them through the WebView interface.

## 8. Next Steps

1. Extend the platform abstraction layer in `src/platform/` (Full FileSystem / Database / Dialog / OCR / TTS interfaces + `CapacitorPlatform` adapter).
2. Implement the Android platform adapter (`CapacitorPlatform`).
3. Adapt Android-specific features (file picker, TTS, OCR, storage paths).
4. Manual test on Android emulator/device (import books, reading, WebDAV sync, TTS, OCR, MDX dictionary).
5. Optional: run the Android release APK through `apkanalyzer`/emulator install in CI.

## 9. Open Questions

- Is upstream mobile source ever going to be open-sourced? If yes, we may switch strategy.
- Should Android support local folder sync through Storage Access Framework, or skip it?
- Which OCR engines should be enabled by default on Android?
- Should we target a minimum Android API level? (Suggested: API 24+)
