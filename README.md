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
- Platform support: Windows, Linux, and Web
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
```

## Repository

- GitHub: https://github.com/NIyueeE/free-koodo-reader
- Default branch: `main`
- Issues / feedback: https://github.com/NIyueeE/free-koodo-reader/issues

## License

This project is based on Koodo Reader and is licensed under AGPL-3.0. See [LICENSE](./LICENSE).
