export type LaunchMode = 'steam' | 'direct';

export interface BeamNGConfig {
  version: string;
  installPath: string;
  userPath: string;
  modsPath: string;
  repoPath: string;
  disabledPath: string;
  stagingPath: string;
  dbJsonPath: string;
  gameRunning: boolean;
  stagedCount: number;
}

export interface LocalMod {
  id: string;
  filename: string;
  fullPath: string;
  originDir: 'repo' | 'mods' | string;
  location: 'repo' | 'mods' | 'disabled' | 'staging' | string;
  active: boolean;
  pinned: boolean;
  title: string;
  author: string;
  version: string;
  tagId: string | null;
  resourceId: number | null;
  category: string;
  sizeBytes: number;
  dateAdded: number;
  lastUpdate: number | null;
  iconUrl: string | null;
  hasUpdate: boolean;
  latestVersion: string | null;
  latestSlug: string | null;
  subscribed?: boolean | null;
}

export interface RepoModItem {
  resourceId: number;
  slug: string;
  title: string;
  version: string;
  author: string;
  tagline: string;
  category: string;
  rating: number;
  ratingCount: number;
  downloads: number;
  subscriptions: number;
  updatedText: string;
  updatedTimestamp: number;
  iconUrl: string;
  installStatus: 'not_installed' | 'installed' | 'update_available' | 'disabled' | 'staged' | string;
  installedVersion: string | null;
  localModId: string | null;
  tagId?: string | null;
  subscribed?: boolean | null;
  hydrated?: boolean;
}

export interface RepoHydrateTarget {
  resourceId: number;
  slug: string;
}

export interface RepoPageResponse {
  items: RepoModItem[];
  currentPage: number;
  totalPages: number;
  repoSource?: 'game_bridge' | 'web_listing' | 'global_catalog' | string;
}

export interface BridgeStatus {
  installed: boolean;
  extensionReady: boolean;
  enabled: boolean;
  port: number;
  gameRunning: boolean;
  reachable: boolean;
  onlineFeatures: boolean;
  authenticated: boolean;
  requestsServed: number;
  outdated?: boolean;
  installedVersion?: string | null;
  bundledVersion?: string;
  runningVersion?: string | null;
}

export interface RepoWebStatus {
  rateLimited: boolean;
  cooldownRemainingSecs: number;
  kind: string;
  statusCode: number | null;
  message: string | null;
  updatedAt: number;
}

export interface BridgeSubResult {
  ok: boolean;
  subscribed: boolean;
  tagId: string;
  message: string;
}

export interface ModUpdateEntry {
  id?: string | null;
  title: string;
  dateText: string;
  bodyHtml: string;
}

export interface RepoModDetails {
  resourceId: number;
  slug: string;
  title: string;
  version: string;
  author: string;
  tagline: string;
  descriptionText: string;
  descriptionHtml?: string;
  recentUpdates?: ModUpdateEntry[];
  category: string;
  rating: number;
  downloads: number;
  fileSizeText: string;
  tagId: string | null;
  downloadUrl: string | null;
  iconUrl: string;
  galleryImages: string[];
  installStatus: string;
  installedVersion: string | null;
  subscribed?: boolean | null;
}

export interface ConflictGroup {
  filePath: string;
  severity: 'high' | 'medium' | 'low' | string;
  mods: string[];
}

export interface ScanReport {
  totalModsScanned: number;
  scanDurationMs: number;
  conflicts: ConflictGroup[];
  corruptZips: string[];
  duplicateMods: string[];
}

export * from './types_extended';

export interface CacheSummary {
  catalogBytes: number;
  catalogExists: boolean;
  localMetadataEntries: number;
  stagingPartFiles: number;
  stagingPartBytes: number;
  memoryRepoEntries: number;
  memoryUpdateEntries: number;
}

export interface CacheClearResult {
  scope: 'repo' | 'local_metadata' | 'staging_parts' | 'all' | string;
  freedBytes: number;
  clearedEntries: number;
}
