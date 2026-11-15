import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  ApplyProfileResult,
  DownloadManagerSnapshot,
  DownloadSettings,
  EnqueueDownloadInput,
  ProfileApplyPreview,
  ProfileImportAnalysis,
  ProfileModRef,
  ProfilesState,
  BeamNGConfig,
  BridgeStatus,
  BridgeSubResult,
  CacheClearResult,
  CacheSummary,
  DownloadProgressPayload,
  LaunchMode,
  LocalMod,
  ModProfile,
  ModUpdateEntry,
  RepoHydrateTarget,
  RepoModDetails,
  RepoModItem,
  RepoPageResponse,
  RepoWebStatus,
  ScanReport,
} from './types';

export const api = {
  getConfig: () => invoke<BeamNGConfig>('get_beamng_config'),
  getLocalMods: () => invoke<LocalMod[]>('get_local_mods'),
  deleteProfile: (profileId: string) =>
    invoke<void>('delete_mod_profile', { profileId }),
  getProfilesState: () => invoke<ProfilesState>('get_profiles_state'),
  createProfileV2: (input: {
    name: string;
    description: string;
    tag: string;
    pinPolicy: 'keep_pinned' | 'strict';
    sourceMode: 'active' | 'empty' | 'copy';
    sourceProfileId?: string | null;
    modIds?: string[] | null;
  }) =>
    invoke<ModProfile>('create_profile_v2', {
      name: input.name,
      description: input.description,
      tag: input.tag,
      pinPolicy: input.pinPolicy,
      sourceMode: input.sourceMode,
      sourceProfileId: input.sourceProfileId ?? null,
      modIds: input.modIds ?? null,
    }),
  updateProfileMeta: (
    profileId: string,
    name: string,
    description: string,
    tag: string,
    pinPolicy: 'keep_pinned' | 'strict',
  ) =>
    invoke<ModProfile>('update_profile_meta', {
      profileId,
      name,
      description,
      tag,
      pinPolicy,
    }),
  setProfileMods: (profileId: string, modIds: string[]) =>
    invoke<ModProfile>('set_profile_mods', { profileId, modIds }),
  syncProfileToActive: (profileId: string) =>
    invoke<ModProfile>('sync_profile_to_active', { profileId }),
  duplicateProfile: (profileId: string, newName: string) =>
    invoke<ModProfile>('duplicate_profile', { profileId, newName }),
  previewApplyProfile: (profileId: string, keepPinnedOverride?: boolean) =>
    invoke<ProfileApplyPreview>('preview_apply_profile', {
      profileId,
      keepPinnedOverride: keepPinnedOverride ?? null,
    }),
  applyProfileV2: (profileId: string, keepPinnedOverride?: boolean) =>
    invoke<ApplyProfileResult>('apply_profile_v2', {
      profileId,
      keepPinnedOverride: keepPinnedOverride ?? null,
    }),
  undoLastProfileApply: () =>
    invoke<ApplyProfileResult>('undo_last_profile_apply'),
  analyzeProfileImport: (rawJson: string) =>
    invoke<ProfileImportAnalysis>('analyze_profile_import', { rawJson }),
  commitImportedProfile: (input: {
    name: string;
    description: string;
    tag: string;
    pinPolicy: 'keep_pinned' | 'strict';
    modIds: string[];
    modRefs: Record<string, ProfileModRef>;
  }) => invoke<ModProfile>('commit_imported_profile', input),
  toggleMod: (modId: string, active: boolean) =>
    invoke<void>('toggle_mod', { modId, active }),
  bulkToggleMods: (modIds: string[], active: boolean) =>
    invoke<number>('bulk_toggle_mods', { modIds, active }),
  togglePin: (modId: string) => invoke<boolean>('toggle_pin', { modId }),
  removeLocalMod: (modId: string) => invoke<void>('remove_local_mod', { modId }),
  importZips: (paths: string[]) => invoke<number>('import_zips', { paths }),
  applyStagedMods: () => invoke<number>('apply_staged_mods'),
  fetchRepoMods: (
    category: string,
    sortBy: string,
    page: number,
    searchQuery: string,
    forceRefresh = false,
    perPage = 12
  ) =>
    invoke<RepoPageResponse>('fetch_repo_mods', {
      category,
      sortBy,
      page,
      searchQuery,
      forceRefresh,
      perPage,
    }),
  hydrateRepoItems: (targets: RepoHydrateTarget[]) =>
    invoke<RepoModItem[]>('hydrate_repo_items', { targets }),
  checkLocalModsChanged: () => invoke<boolean>('check_local_mods_changed'),
  getRepoModDetails: (slug: string, resourceId: number) =>
    invoke<RepoModDetails>('get_repo_mod_details', { slug, resourceId }),
  getRepoModUpdates: (slug: string, resourceId: number) =>
    invoke<ModUpdateEntry[]>('get_repo_mod_updates', { slug, resourceId }),
  openExternalUrl: (url: string) =>
    invoke<void>('open_external_url', { url }),
  cancelDownload: (taskId: string) =>
    invoke<void>('cancel_download', { taskId }),
  getDownloadManagerState: () =>
    invoke<DownloadManagerSnapshot>('get_download_manager_state'),
  enqueueDownloads: (items: EnqueueDownloadInput[]) =>
    invoke<DownloadManagerSnapshot>('enqueue_downloads', { items }),
  pauseDownload: (taskId: string) =>
    invoke<DownloadManagerSnapshot>('pause_download', { taskId }),
  pauseAllDownloads: () =>
    invoke<DownloadManagerSnapshot>('pause_all_downloads'),
  resumeDownload: (taskId: string) =>
    invoke<DownloadManagerSnapshot>('resume_download', { taskId }),
  resumeAllDownloads: () =>
    invoke<DownloadManagerSnapshot>('resume_all_downloads'),
  prioritizeDownload: (taskId: string) =>
    invoke<DownloadManagerSnapshot>('prioritize_download', { taskId }),
  retryDownload: (taskId: string) =>
    invoke<DownloadManagerSnapshot>('retry_download', { taskId }),
  retryAllFailedDownloads: () =>
    invoke<DownloadManagerSnapshot>('retry_all_failed_downloads'),
  cancelAllDownloads: () =>
    invoke<DownloadManagerSnapshot>('cancel_all_downloads'),
  updateDownloadSettings: (settings: DownloadSettings) =>
    invoke<DownloadManagerSnapshot>('update_download_settings', { settings }),
  clearDownloadHistory: () =>
    invoke<DownloadManagerSnapshot>('clear_download_history'),
  checkModUpdates: () => invoke<LocalMod[]>('check_mod_updates'),
  runHealthScan: () => invoke<ScanReport>('run_health_scan'),
  startBeamNG: (mode: LaunchMode = 'steam') =>
    invoke<void>('start_beamng', { mode }),
  openModFolder: (folderType: 'mods' | 'repo' | 'disabled' | 'staging' | 'install' | 'user') =>
    invoke<void>('open_mod_folder', { folderType }),
  getCacheSummary: () => invoke<CacheSummary>('get_cache_summary'),
  clearAppCache: (scope: 'repo' | 'local_metadata' | 'staging_parts' | 'all') =>
    invoke<CacheClearResult>('clear_app_cache', { scope }),
  readClipboardText: () => invoke<string>('read_clipboard_text'),
  writeClipboardText: (text: string) => invoke<void>('write_clipboard_text', { text }),
  getBridgeStatus: () => invoke<BridgeStatus>('get_bridge_status'),
  reloadBridgeExtension: () => invoke<BridgeStatus>('reload_bridge_extension'),
  installBridgeExtension: () => invoke<BridgeStatus>('install_bridge_extension'),
  uninstallBridgeExtension: () => invoke<BridgeStatus>('uninstall_bridge_extension'),
  updateBridgeSettings: (enabled: boolean, port: number) =>
    invoke<BridgeStatus>('update_bridge_settings', { enabled, port }),
  getRepoWebStatus: () => invoke<RepoWebStatus>('get_repo_web_status'),
  subscribeBridgeMod: (tagId: string) =>
    invoke<BridgeSubResult>('bridge_subscribe_mod', { tagId }),
  unsubscribeBridgeMod: (tagId: string, deleteLocal: boolean, localModId: string | null) =>
    invoke<BridgeSubResult>('bridge_unsubscribe_mod', { tagId, deleteLocal, localModId }),
  onDownloadManagerUpdated: (
    handler: (snapshot: DownloadManagerSnapshot) => void,
  ): Promise<UnlistenFn> =>
    listen<DownloadManagerSnapshot>('download-manager-updated', (e) =>
      handler(e.payload),
    ),
  onDownloadProgress: (
    handler: (payload: DownloadProgressPayload) => void
  ): Promise<UnlistenFn> =>
    listen<DownloadProgressPayload>('download-progress', (event) => {
      handler(event.payload);
    }),
  onFileDrop: (handler: (paths: string[]) => void): Promise<UnlistenFn> =>
    listen<{ paths: string[] }>('tauri://drag-drop', (event) => {
      if (event.payload?.paths?.length) {
        handler(event.payload.paths);
      }
    }),
  onLocalModsChanged: (handler: () => void): Promise<UnlistenFn> =>
    listen('local-mods-changed', () => handler()),
};
