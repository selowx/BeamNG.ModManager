export interface ChangelogChange {
  category: 'Added' | 'Improved' | 'Fixed';
  text: string;
}

export interface ChangelogRelease {
  version: string;
  date: string;
  title: string;
  summary: string;
  changes: ChangelogChange[];
}

export const CHANGELOG_RELEASES: ChangelogRelease[] = [
  {
    version: '0.1.0',
    date: '2026-11-15',
    title: 'Initial Public Release — Profiles v2, Stateful Download Manager & Lua Game Bridge',
    summary:
      'Foundational v0.1.0 desktop release built on Tauri v2 (Rust) and React 19 combining parallel local mod management, Profiles v2, a resumable Download Manager, and the v1.0.0 in-game Lua HTTP/1.1 bridge.',
    changes: [
      {
        category: 'Added',
        text: 'Modular `<300`-line SRP architecture (`local_mods/`, `repo_client/`, `bridge_client/`, `hooks/`, `components/`) paired with `rayon`-parallel `.zip`/`info.json` indexing (`local_mods_cache.json`), `mods_staging/` lock-safe staging, and `HealthScannerView` ZIP corruption/duplicate/overwrite conflict inspection.',
      },
      {
        category: 'Added',
        text: 'Official Repository client with exponential rate-limit backoff (`RepoWebStatus` for HTTP `429`/`503`), `350ms` debounced `api.beamng.com` search, `repo_catalog.json` offline snapshot fallback, native Rust XenForo BBCode AST/XSS sanitizer (`bbcode.rs`), and per-mod `tag_id` update checking.',
      },
      {
        category: 'Added',
        text: 'In-game Lua HTTP/1.1 loopback bridge (`util_modmanagerBridge` v1.0.0) bound to `127.0.0.1:23519` with `X-Bridge-Token` authentication, non-blocking socket polling (`150ms` active / `1s` paused), `own=1` subscription sync, Vue 3 `BridgeSettings` overlay, and `/v1/reload` hot-reloading.',
      },
      {
        category: 'Added',
        text: 'Dedicated `Profiles` tab (`ProfilesView`, `ProfileModList`, `CreateProfileModal`, `ApplyProfilePreviewModal`, `ImportProfileModal`) supporting `ModProfileRef` metadata, tag filters, `Strict` / `Keep Protected` pin policies, pre-apply diff preview, 1-step `Undo Last Switch`, and JSON import/export.',
      },
      {
        category: 'Added',
        text: 'Two-tier Download Manager (`DownloadDockWidget` dock, slide-over `DownloadManagerPanel`, and `DownloadMiniStrip`) backed by `download_manager.rs` with `1–3` concurrent slots, `HTTP Range` (`206`) resumable `.part` transfers, token-bucket bandwidth throttling (`download_throttle.rs`), ZIP magic-header checks, and persistent history.',
      },
      {
        category: 'Added',
        text: 'Unified `Settings & Info` workspace (`SettingsInfoView`, `SettingsCacheSection`, `CreditsSection`) featuring `Steam`/`Direct (.exe)` launch selection, `InputContextMenu` (`clipboard.rs` Win32 clipboard APIs), and scoped cache clearing (`cache_manager.rs`) across `repo`, `local_metadata`, and `staging_parts`.',
      },
      {
        category: 'Added',
        text: 'Custom Dark Slate `<SelectDropdown />` (`src/components/ui/select.tsx`) with directional popovers, `Escape` dismissal, and outside-click closing replacing native OS `<select>` elements across `LocalModsView`, `RepoToolbar`, and `CreateProfileModal`.',
      },
      {
        category: 'Improved',
        text: 'Unified the BeamNG Dark Slate (`#161922`/`#1c202a`) & Orange (`#ff6600`) design system with responsive header breakpoints (`1120x700` minimum window), `<Switch />`/`<Button />` primitives, `11px` typography tokens, bundled `latin`/`latin-ext` WOFF2 fonts (`Overpass`, `Noto Sans`), and Cargo release LTO + symbol stripping.',
      },
      {
        category: 'Improved',
        text: 'Replaced blocking `tasklist.exe` process checks with an off-thread `AtomicBool` game watcher (`beamng_env.rs`), added a `3s` mtime/size filesystem watcher (`local-mods-changed`), and removed legacy v1 IPC commands and redundant `i18n` keys.',
      },
      {
        category: 'Fixed',
        text: 'Synchronized `set_profile_mods` (`local_mods/profiles.rs`) live to disk when editing the active profile while BeamNG.drive is closed and locked redundant `Apply Profile` / `Apply & Play` actions when no drift is present.',
      },
    ],
  },
];
