# Changelog

All notable changes to BeamNG ModManager are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-11-14 — Custom UI Controls, Active Profile Live-Sync & Dead-Code Purge

Replaces native OS form controls with custom Dark Slate primitives, synchronizes active profile edits directly to disk, and removes legacy v1 IPC/UI code.

### Added
- **Custom `<SelectDropdown />` Control (`src/components/ui/select.tsx`):** Added a BeamNG Dark Slate/Orange dropdown component with directional popovers, keyboard `Escape` handling, and outside-click dismissal replacing native `<select>` tags in `LocalModsView`, `RepoToolbar`, and `CreateProfileModal`.

### Improved
- **Standardized Primitives & Typography:** Replaced raw `<button>` and `<input type="checkbox">` elements in `DownloadManagerPanel`, `DownloadTaskRow`, `DownloadDockWidget`, `HealthScannerView`, and profile modals with `<Button />` and `<Switch />`, and standardized `10px` labels to `11px` tokens.
- **Dead-Code Purge:** Removed legacy v1 Rust commands, unused `api.ts` methods, redundant `UI_TEXT` keys (merging `i18n_extra.ts` into `i18n.ts`), and unused type re-exports.

### Fixed
- **Active Profile Live-Sync & Apply Lock:** Updated `set_profile_mods` in `local_mods/profiles.rs` to immediately enable/disable delta mods on disk when modifying the active profile (while BeamNG is closed), and locked redundant re-apply actions when a profile is already active.

## [0.0.6] - 2026-11-14 — Profiles v2 Workspace & Two-Tier Stateful Download Manager

Introduces a dedicated Profiles workspace with diff previews and undo backups alongside a multi-slot resumable Download Manager.

### Added
- **Profiles v2 Workspace (`ProfilesView`):** Added a dedicated `Profiles` tab with tag filters, pre-apply diff preview (`ApplyProfilePreviewModal`), pin-policy controls, 1-step undo backup, and JSON import/export (`CreateProfileModal`, `ImportProfileModal`).
- **Two-Tier Stateful Download Manager:** Added `DownloadDockWidget` and the slide-over `DownloadManagerPanel` backed by `download_manager.rs` with 1-3 concurrent transfer slots, queue prioritization, history tracking, and missing-mod batch queueing.
- **Bandwidth Throttling & Range Resume:** Added `download_throttle.rs` (`200ms` token-bucket speed limiter), HTTP `Range` pause/resume, and ZIP magic-header verification.

## [0.0.5] - 2026-11-14 — Win32 Input Context Menu, Settings Hub, Scoped Cache & Binary Size Optimization

Unifies settings, diagnostics, and release notes while replacing WebView context menus and tuning frontend/Rust release artifacts.

### Added
- **Win32 Input Context Menu (`clipboard.rs` / `InputContextMenu`):** Added a scoped `Cut / Copy / Paste / Select All` menu for text inputs backed by Win32 clipboard APIs.
- **Settings & Info Workspace (`SettingsInfoView`):** Consolidated `Settings & Cache`, embedded `Health & Conflicts`, `Changelog`, and `Credits & Paths` with persisted launch/view preferences and Explorer shortcuts.
- **Scoped Cache Cleaner (`cache_ops.rs`):** Added selective clearing for `repo`, `local_metadata`, and `staging_parts` caches with freed-byte metrics while leaving `.zip` archives, pins, and profiles untouched.

### Improved
- **Bundle & Binary Size Optimization:** Subset embedded WOFF2 fonts to `latin`/`latin-ext` (cutting `dist/` from `3.18 MB` to `1.05 MB`) and enabled Cargo release LTO + symbol stripping (`3.12 MiB` NSIS installer, `7.51 MiB` standalone binary).

## [0.0.4] - 2026-11-13 — Hybrid In-Game Lua Bridge (`util_modmanagerBridge`), Subscriptions & Hot-Reload

Connects the desktop client directly to the running BeamNG Lua runtime for authenticated Repository browsing, subscription sync, and zero-restart bridge updates.

### Added
- **In-Game Lua HTTP/1.1 Bridge (`util_modmanagerBridge`):** Bound strictly to `127.0.0.1:23519` with `X-Bridge-Token` authentication and `Host` header validation.
- **Non-Blocking Polling & Subscription Sync:** Polls sockets at `150ms` active (`1s` paused) intervals to proxy `s1/v4/getMods`, `s1/v4/getMod`, and `own=1` subscriptions via BeamNG's active session.
- **Hot-Reload & Font Stack:** Added `/v1/reload` deferred Lua hot-reloading, a frosted-glass Vue 3 `BridgeSettings` overlay in-game, and the embedded Overpass / Noto Sans WOFF2 font stack.

## [0.0.3] - 2026-11-13 — BeamNG Dark Slate Design System, Server-Side Repo Search & FS Signature Watcher

Establishes the BeamNG Dark Slate & Orange interface language alongside debounced Repository search and low-overhead filesystem change detection.

### Improved
- **BeamNG Dark Slate Design System:** Unified the UI on `#161922`/`#1c202a` surfaces with `#ff6600` accents, `-skew-x-[18deg]` header markers, and `tabular-nums` alignment.

### Added
- **Server-Side Repo Search:** Added `350ms` debounced `api.beamng.com` search queries with `repo_catalog.json` offline snapshot fallback.
- **FS Signature Watcher:** Added a 3-second mtime/size signature watcher emitting `local-mods-changed` events for live folder synchronization.

## [0.0.2] - 2026-11-13 — HTTP Rate-Limit Resilience, Rust BBCode AST/Sanitizer & Targeted Update Engine

Hardens Official Repository networking against rate limits and adds native Rust BBCode parsing, resumable transfers, and targeted mod update checks.

### Added
- **Rate-Limit Resilience:** Added exponential backoff and live cooldown status (`RepoWebStatus`) for HTTP `429`/`503` responses.
- **Rust BBCode AST & Sanitizer (`bbcode.rs`):** Added XSS-hardened XenForo BBCode-to-HTML rendering for `ModDetailDrawer`, gallery lightbox, and version changelogs.
- **Targeted Update Engine:** Added HTTP `Range` (`206`) resumable `.part` downloads, per-mod `tag_id` update checking, and persisted per-page controls.

## [0.0.1] - 2026-11-11 — Modular SRP Refactor, Parallel `rayon` Indexer & Non-Blocking Process Monitor

Foundational Tauri v2 (Rust) + React 19 release splitting the codebase into SRP modules with parallel archive indexing and lock-safe mod staging.

### Added
- **Modular SRP Architecture:** Split the frontend and Rust backend into `<300`-line single-responsibility modules with a clean English-only desktop interface.
- **Parallel `rayon` Indexer & Staging Queue:** Added `rayon`-parallel `.zip`/`info.json` indexing backed by `local_mods_cache.json` and `mods_staging/` lock-safe staging while BeamNG.drive is running.
- **Non-Blocking Process Monitor & Health Scanner:** Replaced blocking `tasklist.exe` checks with an off-thread `AtomicBool` monitor and added ZIP corruption, duplicate, and file-overwrite conflict analysis.
