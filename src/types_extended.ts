export interface ProfileModRef {
  modId: string;
  title: string;
  filename: string;
  author: string;
  resourceId: number | null;
  tagId: string | null;
  slug: string | null;
  sizeBytes: number;
}

export type ProfileTag = 'general' | 'career' | 'multiplayer' | 'drift' | 'offroad' | 'minimal' | string;
export type ProfilePinPolicy = 'keep_pinned' | 'strict' | string;

export interface ModProfile {
  id: string;
  name: string;
  description: string;
  tag: ProfileTag;
  modIds: string[];
  modRefs: Record<string, ProfileModRef>;
  pinPolicy: ProfilePinPolicy;
  createdAt: number;
  updatedAt: number;
  lastAppliedAt: number | null;
}

export interface ProfilesState {
  profiles: ModProfile[];
  activeProfileId: string | null;
  hasUndoBackup: boolean;
}

export interface ProfileApplyPreview {
  profileId: string;
  profileName: string;
  pinPolicy: ProfilePinPolicy;
  toEnable: ProfileModRef[];
  toDisable: ProfileModRef[];
  keptPinned: ProfileModRef[];
  missingDownloadable: ProfileModRef[];
  missingManual: ProfileModRef[];
  alreadyActiveCount: number;
  gameRunning: boolean;
}

export interface ApplyProfileResult {
  changedCount: number;
  activeProfileId: string | null;
  hasUndoBackup: boolean;
}

export interface ProfileImportAnalysis {
  name: string;
  description: string;
  tag: ProfileTag;
  pinPolicy: ProfilePinPolicy;
  modIds: string[];
  modRefs: Record<string, ProfileModRef>;
  installedCount: number;
  missingDownloadable: ProfileModRef[];
  missingManual: ProfileModRef[];
  duplicateNameExists: boolean;
}

export type DownloadTaskStatus =
  | 'queued'
  | 'downloading'
  | 'paused'
  | 'verifying'
  | 'staged'
  | 'installed'
  | 'cancelled'
  | 'error'
  | string;

export interface EnqueueDownloadInput {
  resourceId: number;
  slug: string;
  title: string;
}

export interface DownloadProgressPayload {
  taskId: string;
  resourceId: number;
  title: string;
  filename: string;
  downloadedBytes: number;
  totalBytes: number;
  speedBps: number;
  status: DownloadTaskStatus;
  message: string | null;
}

export interface DownloadTaskRecord extends DownloadProgressPayload {
  slug: string;
  etaSeconds: number | null;
  partPath: string | null;
  priority: number;
  createdAt: number;
}

export interface DownloadHistoryEntry {
  taskId: string;
  resourceId: number;
  slug: string;
  title: string;
  filename: string;
  sizeBytes: number;
  status: string;
  completedAt: number;
  localModId: string | null;
}

export interface DownloadSettings {
  maxConcurrent: number;
  speedLimitBps: number;
  postDownloadMode: 'enabled' | 'disabled' | string;
  addToActiveProfile: boolean;
}

export interface DownloadManagerSnapshot {
  tasks: DownloadTaskRecord[];
  history: DownloadHistoryEntry[];
  settings: DownloadSettings;
}
