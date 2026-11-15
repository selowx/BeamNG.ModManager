# Changelog

All notable changes to BeamNG ModManager are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-11-15 — Initial Public Release — Profiles v2, Stateful Download Manager & Lua Game Bridge

Foundational `v0.1.0` desktop release built on Tauri v2 (Rust) and React 19 combining parallel local mod management, Profiles v2, a resumable Download Manager, and the `v1.0.0` in-game Lua HTTP/1.1 bridge.

### Added
- **Modular SRP Architecture & Local Indexer:** Split frontend and Rust backend into `<300`-line single-responsibility modules (`local_mods/`, `repo_client/`, `bridge_client/`, `hooks/`, `components/`) with `rayon`-parallel `.zip`/`info.json` indexing (`local_mods_cache.json`), `mods_staging/` lock-safe staging, and `HealthScannerView` ZIP corruption/duplicate/overwrite conflict inspection.
- **Official Repository Client:** Added `350ms` debounced `api.beamng.com` search, exponential HTTP `429`/`503` backoff telemetry (`RepoWebStatus`), `repo_catalog.json` offline snapshot fallback, native Rust XenForo BBCode AST/XSS sanitizer (`bbcode.rs`), and per-mod `tag_id` update checking.
- **In-Game Lua Bridge (`v1.0.0`):** Added embedded `util_modmanagerBridge` HTTP/1.1 loopback server bound to `127.0.0.1:23519` with `X-Bridge-Token` authentication, non-blocking socket polling (`150ms` active / `1s` paused), `own=1` account subscription sync, Vue 3 `BridgeSettings` overlay, and `/v1/reload` hot-reloading.
- **Profiles v2 Workspace:** Added dedicated `Profiles` tab (`ProfilesView`, `ProfileModList`, `CreateProfileModal`, `ApplyProfilePreviewModal`, `ImportProfileModal`) with `ModProfileRef` metadata, tag filtering, `Strict` / `Keep Protected` pin policies, pre-apply diff preview, 1-step `Undo Last Switch`, and JSON import/export.
- **Two-Tier Stateful Download Manager:** Added sidebar `DownloadDockWidget`, slide-over `DownloadManagerPanel`, and `DownloadMiniStrip` backed by `download_manager.rs` with `1–3` concurrent transfer slots, `HTTP Range` (`206`) resumable `.part` downloads, token-bucket bandwidth throttling (`download_throttle.rs`), ZIP magic-header checks, and persistent history.
- **Settings Hub, Clipboard Menu & Scoped Cache Cleaner:** Added unified `Settings & Info` workspace (`SettingsInfoView`, `SettingsCacheSection`, `CreditsSection`) with persisted `Steam`/`Direct (.exe)` launch mode, Win32 `InputContextMenu` (`clipboard.rs`), and selective `repo`, `local_metadata`, and `staging_parts` cache cleanup (`cache_manager.rs`).
- **Custom Dark Slate Controls (`<SelectDropdown />`):** Replaced native OS `<select>` elements across `LocalModsView`, `RepoToolbar`, and `CreateProfileModal` with `src/components/ui/select.tsx` supporting directional popovers, `Escape` dismissal, and outside-click closing.

### Improved
- **BeamNG Dark Slate UI, Typography & Binary Optimization:** Unified `#161922`/`#1c202a` surfaces with `#ff6600` accents, responsive header breakpoints (`1120x700` minimum window), standardized `<Switch />`/`<Button />` primitives, `11px` typography tokens, bundled `latin`/`latin-ext` WOFF2 fonts (`Overpass`, `Noto Sans`), and Cargo release LTO + symbol stripping.
- **Non-Blocking Runtime Watchers & IPC Cleanup:** Replaced synchronous `tasklist.exe` checks with an off-thread `AtomicBool` process monitor (`beamng_env.rs`), added a `3s` mtime/size filesystem watcher (`local-mods-changed`), and removed legacy v1 IPC commands and unused `i18n` keys.

### Fixed
- **Active Profile Live-Sync & Apply Lock:** Updated `set_profile_mods` in `local_mods/profiles.rs` to live-sync delta mods on disk when editing the active profile (while BeamNG.drive is closed), and locked redundant `Apply Profile` / `Apply & Play` actions when no drift is present.
