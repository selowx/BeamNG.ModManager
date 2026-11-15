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
    date: '2026-11-14',
    title: 'Custom UI Controls, Active Profile Live-Sync & Dead-Code Purge',
    summary:
      'Replaces native OS form controls with custom Dark Slate primitives, synchronizes active profile edits directly to disk, and removes legacy v1 IPC/UI code.',
    changes: [
      {
        category: 'Added',
        text: 'Custom `<SelectDropdown />` (`src/components/ui/select.tsx`) with BeamNG Dark Slate/Orange styling, directional popovers, keyboard `Escape` handling, and outside-click dismissal replacing native OS `<select>` elements across `LocalModsView`, `RepoToolbar`, and `CreateProfileModal`.',
      },
      {
        category: 'Improved',
        text: 'Standardized `<Switch />` and `<Button />` primitives across `DownloadManagerPanel`, `DownloadTaskRow`, `DownloadDockWidget`, `HealthScannerView`, and profile modals while upgrading remaining `10px` micro-labels to `11px` tokens.',
      },
      {
        category: 'Improved',
        text: 'Purged legacy v1 Rust commands, unused `api.ts` wrappers, redundant `UI_TEXT` keys (`i18n_extra.ts` consolidated into `i18n.ts`), and dead type re-exports.',
      },
      {
        category: 'Fixed',
        text: 'Fixed `set_profile_mods` in `local_mods/profiles.rs` to live-sync added/removed mods on disk when editing the currently active profile and added an apply lock preventing accidental re-apply while already active.',
      },
    ],
  },
  {
    version: '0.0.6',
    date: '2026-11-14',
    title: 'Profiles v2 Workspace & Two-Tier Stateful Download Manager',
    summary:
      'Introduces a dedicated Profiles workspace with diff previews and undo backups alongside a multi-slot resumable Download Manager.',
    changes: [
      {
        category: 'Added',
        text: 'Dedicated `Profiles` tab (`ProfilesView`, `ProfileModList`, `CreateProfileModal`, `ApplyProfilePreviewModal`, `ImportProfileModal`) with tag filtering, pre-apply diff preview, pin-policy overrides, 1-step undo backup, and JSON import/export.',
      },
      {
        category: 'Added',
        text: 'Two-tier Download Manager (`DownloadDockWidget` + slide-over `DownloadManagerPanel`) backed by `download_manager.rs` supporting 1-3 concurrent download slots, priority queueing, persistent history, and missing-mod batch queueing.',
      },
      {
        category: 'Added',
        text: 'Token-bucket bandwidth limiter (`download_throttle.rs`) with `200ms` pacing windows alongside HTTP `Range` pause/resume and ZIP magic-header verification.',
      },
    ],
  },
  {
    version: '0.0.5',
    date: '2026-11-14',
    title: 'Win32 Input Context Menu, Settings Hub, Scoped Cache & Binary Size Optimization',
    summary:
      'Unifies settings, diagnostics, and release notes while replacing WebView context menus and tuning frontend/Rust release artifacts.',
    changes: [
      {
        category: 'Added',
        text: 'Custom `InputContextMenu` (`Cut / Copy / Paste / Select All`) backed by `clipboard.rs` Win32 clipboard APIs for clean text input interaction.',
      },
      {
        category: 'Added',
        text: 'Unified `Settings & Info` tab (`SettingsInfoView`, `SettingsCacheSection`, `CreditsSection`) with persisted launch/view preferences, Explorer path shortcuts, and embedded `Health & Conflicts` diagnostics.',
      },
      {
        category: 'Added',
        text: 'Scoped cache cleaner (`cache_ops.rs`) clearing `repo`, `local_metadata`, and orphaned `staging_parts` caches with freed-byte reporting without touching installed `.zip` archives, pins, or profiles.',
      },
      {
        category: 'Improved',
        text: 'Subset embedded WOFF2 fonts to `latin`/`latin-ext` (shrinking `dist/` from `3.18 MB` to `1.05 MB`) paired with Cargo release LTO and symbol stripping (`3.12 MiB` NSIS installer, `7.51 MiB` standalone binary).',
      },
    ],
  },
  {
    version: '0.0.4',
    date: '2026-11-13',
    title: 'Hybrid In-Game Lua Bridge (`util_modmanagerBridge`), Subscriptions & Hot-Reload',
    summary:
      'Connects the desktop client directly to the running BeamNG Lua runtime for authenticated Repository browsing, subscription sync, and zero-restart bridge updates.',
    changes: [
      {
        category: 'Added',
        text: 'Embedded Lua HTTP/1.1 loopback server (`util_modmanagerBridge`) bound to `127.0.0.1:23519` with `X-Bridge-Token` authentication and `Host` validation.',
      },
      {
        category: 'Added',
        text: 'Non-blocking socket polling (`150ms` active / `1s` paused) proxying `s1/v4/getMods`, `s1/v4/getMod`, and `own=1` account subscriptions through BeamNG’s active session.',
      },
      {
        category: 'Added',
        text: 'Zero-restart Lua hot-reload via `/v1/reload`, frosted-glass Vue 3 `BridgeSettings` view in-game, and embedded Overpass / Noto Sans WOFF2 font stack.',
      },
    ],
  },
  {
    version: '0.0.3',
    date: '2026-11-13',
    title: 'BeamNG Dark Slate Design System, Server-Side Repo Search & FS Signature Watcher',
    summary:
      'Establishes the BeamNG Dark Slate & Orange interface language alongside debounced Repository search and low-overhead filesystem change detection.',
    changes: [
      {
        category: 'Improved',
        text: 'Redesigned UI around the BeamNG Dark Slate (`#161922` / `#1c202a`) & Orange (`#ff6600`) palette with `-skew-x-[18deg]` header accents and `tabular-nums` alignment.',
      },
      {
        category: 'Added',
        text: '350ms debounced server-side search against `api.beamng.com` with `repo_catalog.json` offline snapshot fallback and switchable Repo layouts.',
      },
      {
        category: 'Added',
        text: '3-second mtime/size signature filesystem watcher emitting `local-mods-changed` events for automatic UI refresh on external folder edits.',
      },
    ],
  },
  {
    version: '0.0.2',
    date: '2026-11-13',
    title: 'HTTP Rate-Limit Resilience, Rust BBCode AST/Sanitizer & Targeted Update Engine',
    summary:
      'Hardens Official Repository networking against rate limits and adds native Rust BBCode parsing, resumable transfers, and targeted mod update checks.',
    changes: [
      {
        category: 'Added',
        text: 'Exponential backoff and live cooldown telemetry (`RepoWebStatus`) for HTTP `429`/`503` responses on `api.beamng.com`.',
      },
      {
        category: 'Added',
        text: 'XSS-hardened Rust XenForo BBCode AST/sanitizer (`bbcode.rs`) powering the `ModDetailDrawer` description, media lightbox, and version changelog views.',
      },
      {
        category: 'Added',
        text: 'HTTP `Range` (`206 Partial Content`) resumable `.part` downloads, per-mod `tag_id` update checking (`check_local_mod_updates`), and persisted per-page pagination controls.',
      },
    ],
  },
  {
    version: '0.0.1',
    date: '2026-11-11',
    title: 'Modular SRP Refactor, Parallel `rayon` Indexer & Non-Blocking Process Monitor',
    summary:
      'Foundational Tauri v2 (Rust) + React 19 release splitting the codebase into SRP modules with parallel archive indexing and lock-safe mod staging.',
    changes: [
      {
        category: 'Added',
        text: 'Refactored monolithic frontend and Rust backend into `<300`-line SRP modules (`local_mods/`, `repo_client/`, `hooks/`, `components/`) with a clean English-only UI.',
      },
      {
        category: 'Added',
        text: 'Parallel `rayon` `.zip` & `info.json` metadata indexer persisted to `local_mods_cache.json`, paired with `mods_staging/` lock-safe staging while BeamNG is running.',
      },
      {
        category: 'Added',
        text: 'Off-thread `AtomicBool` game process monitor avoiding synchronous `tasklist.exe` UI stalls, plus ZIP integrity and overwrite conflict scanning (`HealthScannerView`).',
      },
    ],
  },
];
