# PSG Mail

**Panorama Scholarly Group — Institutional Email Client**

A self-hosted, Cloudflare-native email platform built for institutional deployment. Runs entirely on the Cloudflare edge (Workers · D1 · KV · R2) with a Vue 3 web client and a cross-platform Electron desktop application.

[![License: Proprietary](https://img.shields.io/badge/license-Proprietary-red)](LICENSE)
[![Release](https://img.shields.io/github/v/release/WENSHAO521/PSG-mail)](https://github.com/WENSHAO521/PSG-mail/releases)

---

## Features

- **Cloudflare-native** — Workers backend, D1 database, KV cache, R2 object storage; no dedicated server required
- **Responsive web client** — Full-featured interface adapting to desktop and mobile browsers
- **Desktop application** — Native Windows, macOS, and Linux apps with system tray, notifications, and auto-update
- **Auto-update** — Desktop app checks for new releases on launch and installs silently on next quit
- **Email composition** — Rich-text editor, inline images, attachments, bulk send, delivery status tracking
- **Admin console** — User management, RBAC permission control, quota enforcement, system statistics
- **Attachment support** — Upload and download files via Cloudflare R2 object storage
- **Push forwarding** — Forward incoming mail to a Telegram bot or third-party mailbox
- **Open API** — Bulk user provisioning, multi-condition mail queries
- **AI verification code recognition** — Workers AI automatically extracts OTP codes from received mail
- **Data visualisation** — ECharts dashboards for system metrics and mail volume trends
- **Bot protection** — Cloudflare Turnstile integration on registration forms

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Cloudflare Workers |
| Backend framework | Hono |
| ORM | Drizzle |
| Database | Cloudflare D1 (SQLite) |
| Cache | Cloudflare KV |
| File storage | Cloudflare R2 |
| Email delivery | Resend |
| Frontend | Vue 3 + Element Plus |
| Desktop shell | Electron + electron-builder |
| Auto-update | electron-updater + GitHub Releases |

---

## Desktop App

Pre-built installers are published to [GitHub Releases](https://github.com/WENSHAO521/PSG-mail/releases) for every platform:

| Platform | Format |
|----------|--------|
| Windows | NSIS installer (`.exe`) |
| macOS | DMG + ZIP (`.dmg`, `.zip`) |
| Linux | AppImage (`.AppImage`) |

The desktop app automatically checks for updates on launch and installs the new version when the app is next closed.

---

## Project Structure

```
PSG-mail
├── mail-worker          # Cloudflare Workers backend
│   ├── src
│   │   ├── api          # API route handlers
│   │   ├── dao          # Data access layer
│   │   ├── service      # Business logic
│   │   ├── security     # JWT authentication, RBAC
│   │   ├── email        # Inbound mail processing
│   │   └── index.js     # Entry point
│   └── wrangler.toml    # Worker configuration
│
└── mail-vue             # Vue 3 frontend + Electron shell
    ├── src
    │   ├── components   # Shared UI components
    │   ├── layout       # App shell (sidebar, header, compose)
    │   ├── views        # Page components
    │   ├── store        # Pinia state management
    │   └── i18n         # Internationalisation (zh / en)
    └── electron         # Electron main process & preload
```

---

## Deployment

Full setup instructions — including Cloudflare Workers configuration, D1 database initialisation, and email routing — are available in the [deployment documentation](https://doc.skymail.ink).

---

## Open Source Attribution

PSG Mail is a fork of [**Cloud Mail**](https://github.com/maillab/cloud-mail) by [maillab](https://github.com/maillab), released under the [MIT License](LICENSE).

Key modifications made in this fork:
- Redesigned Brutalist Academic UI (Black / White / Red palette, JetBrains Mono typography)
- Full Solar icon set audit — all icons unified to the `solar:` collection
- Native Electron desktop application with auto-update via GitHub Releases
- Institutional branding for Panorama Scholarly Group

---

## License

© 2025 Panorama Scholarly Group. All Rights Reserved.

This software is proprietary. Copying, redistribution, and private or commercial use by any party outside of Panorama Scholarly Group is strictly prohibited. See [LICENSE](LICENSE) for full terms.

Original open-source components from [Cloud Mail](https://github.com/maillab/cloud-mail) (MIT License) are attributed in the license file.
