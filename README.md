# Free Koodo Reader

A local-first, privacy-friendly fork of [Koodo Reader](https://github.com/koodo-reader/koodo-reader). It keeps the powerful cross-platform ebook reading experience while removing official cloud services, accounts, Pro gating, and AI cloud features.

## Why this fork

- No login / account / Pro / payment system
- No official Koodo cloud sync or AI services
- No macOS build artifacts or Apple-specific compatibility code
- WebDAV sync is implemented with the open-source `webdav` package and supports **HTTPS only**
- Cloud credentials are stored locally and encrypted
- Local folder sync is still supported

## Features

- Format support:
  - EPUB, PDF, MOBI, AZW3, AZW, TXT, FB2
  - Comic book archive: CBR, CBZ, CBT, CB7
  - Rich text: MD, DOCX
  - HyperText: HTML, XML, XHTML, MHTML, HTM
- Platform support: Windows, Linux, Web, and Android (Capacitor)
- Sync / backup:
  - WebDAV (HTTPS only)
  - Local folder
- TTS:
  - System local TTS
  - Custom TTS API / self-hosted voice plugins
- OCR:
  - System OCR (Windows)
  - Local OCR (PaddleOCR, Tesseract)
  - External OCR API
- Local MDX dictionary support

## Getting Started

```bash
# Install dependencies
yarn

# Desktop development mode (Electron + React hot reload)
yarn dev

# Web development mode (browser only)
yarn start

# Production build
yarn build

# Type check
npx tsc --noEmit --noUnusedLocals false --noUnusedParameters false

# Package distribution
yarn release

# Android (Capacitor)
yarn android:sync          # Sync the web build into the Android project
yarn android:build         # Build a debug APK
yarn android:build:release # Build a release APK
```

## CI/CD

The repository uses GitHub Actions (with concurrency cancellation + job timeouts):

- `ci.yml` — on every push/PR to `main`:
  - TypeScript type check
  - ESLint (zero warnings allowed)
  - Unit & smoke tests (`yarn test`): i18n integrity, platform detection,
    **live WebDAV smoke** (real HTTPS server, full sync round trip),
    **IPC contract** (preload allowlist ↔ main.js handlers), **preload
    security boundary**, **database service** (browser-mode CRUD)
  - Production renderer build (`build/` is git-ignored, so the bundle is always built - a missing renderer is what caused the historic white-screen bug)
  - Package identifier alignment check (Desktop `appId` == Capacitor `appId` == Android `applicationId`)
  - Android debug APK build + renderer-presence check
  - **GUI smoke test**: launches the real Electron app under Xvfb and verifies the renderer mounts (no white screen); a screenshot is uploaded as an artifact
- `release.yml` — desktop (Windows/Linux) and Android releases on workflow dispatch or version tags (`v*`):
  - Runs the same typecheck / ESLint / unit + smoke test suite before packaging
  - Always builds the renderer before `electron-builder` and refuses to package when `build/index.html` is missing
  - Android release APK is signed with the dedicated `android/app/keystore/free-koodo-reader.jks` keystore (credentials in `android/app/keystore.properties`, overridable via CI secrets `ANDROID_KEYSTORE_BASE64` / `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_ALIAS` / `ANDROID_KEY_PASSWORD`) and verified with `apksigner`
- `docker-publish.yml` — Docker image publishing (self-hosted web deployment, manual trigger).

## Android

- Package name: `xyz.freekoodo.reader` (aligned with the desktop `appId`).
- The manager UI auto-collapses the sidebar into an icon strip on narrow screens (≤ 768 px) and includes responsive header/dialog layout, so phones and tablets stay usable.
- Serial number / signature: release APKs are signed with `free-koodo-reader.jks` (store password and key password in `keystore.properties`).

## Repository

- GitHub: https://github.com/NIyueeE/free-koodo-reader
- Default branch: `main`
- Issues / feedback: https://github.com/NIyueeE/free-koodo-reader/issues

## License

This project is based on Koodo Reader and is licensed under AGPL-3.0. See [LICENSE](./LICENSE).
