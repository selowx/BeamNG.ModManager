# BeamNG.ModManager

Desktop mod manager and Official Repository client for **BeamNG.drive**, built with **Tauri v2 (Rust)** and **React 19 (TypeScript / Tailwind CSS v4)**.

Current release: **`v0.7.0`** — see [CHANGELOG.md](./CHANGELOG.md) for chronological release notes.

## Capabilities

- **Installed Mods Management**
  - Direct file management across `mods/` and `mods_disabled/` with filesystem signature polling (`local-mods-changed`)
  - Drag-and-drop `.zip` installation and protection locks (`pinned`) preserved during bulk operations and deletions
  - Targeted `tag_id` update checking, per-mod updates, and `Update All` batch queueing
- **Profiles (`Profiles v2`)**
  - Dedicated workspace for switchable mod packs backed by `ModProfileRef` metadata and tag filters
  - `Strict` vs. `Keep Protected` pin policies, pre-apply diff preview, and 1-step `Undo Last Switch` backup
  - Live disk synchronization when editing the active profile (with BeamNG closed), drift detection, missing-mod batch download, and JSON import/export
- **Download Manager**
  - Dock summary widget (`Installed Mods` sidebar) with a slide-over queue/history/limits drawer and cross-tab mini status strip
  - `1–3` configurable concurrent download slots, `HTTP Range` (`206`) resumable `.part` transfers, token-bucket bandwidth throttling, and ZIP magic-header checks
  - Lock-safe `mods_staging/` queueing whenever BeamNG.drive is running (monitored off-thread via an `AtomicBool` watcher)
- **Official Repository & Game Bridge**
  - Server-side `api.beamng.com` search with HTTP `429`/`503` backoff cooldown reporting and offline `repo_catalog.json` fallback
  - Hybrid in-game Lua HTTP/1.1 bridge ([modmanagerBridge.lua](./src-tauri/assets/bridge/modmanagerBridge.lua)) bound to `127.0.0.1:23519` with `X-Bridge-Token` authentication, subscription sync, and `/v1/reload` hot-reloading
  - Native Rust XenForo BBCode AST parser and XSS sanitizer for mod descriptions, image galleries, and changelogs
- **Health & Conflict Scanner**
  - `rayon`-parallel `.zip` archive inspection detecting corrupted archives, duplicate mod IDs, and internal file-overwrite conflicts
- **Settings, Launch & Cache Control**
  - `Steam` or `Direct (.exe)` BeamNG.drive launch selector (`Play`) and Explorer folder shortcuts
  - Selective cache clearing (`repo`, `local_metadata`, `staging_parts`) without touching installed `.zip` archives, disabled mods, pins, or profiles

## Tech Stack

| Layer | Technologies |
| :--- | :--- |
| Desktop Runtime | Tauri `2.2` (`wry` / WebView2 on Windows) |
| Backend | Rust (`2021` edition), `tokio`, `reqwest` (`rustls-tls`), `zip`, `rayon`, `scraper`, `serde` |
| Frontend | React `19`, TypeScript `5.7`, Vite `6`, Tailwind CSS `v4`, `lucide-react` |
| Typography | Bundled WOFF2 font stack (`Overpass`, `Overpass Mono`, `Noto Sans`) |

## Requirements

- [Node.js](https://nodejs.org/) (LTS) and `npm`
- [Rust toolchain](https://rustup.rs/) (`cargo`, `rustc`)
- Windows: Microsoft Edge WebView2 Runtime & Visual Studio C++ Build Tools (required by Tauri v2)

## Development & Build

Install frontend dependencies:

```bash
npm install
```

Run in development mode (Vite dev server + Tauri window):

```bash
npm run tauri dev
```

Type-check and build frontend assets (`dist/`):

```bash
npm run build
```

Run Rust backend compilation check and unit tests:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

Build release binaries and Windows NSIS installer:

```bash
npm run tauri build
```
