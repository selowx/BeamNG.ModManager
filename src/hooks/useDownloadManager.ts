import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import type {
  DownloadHistoryEntry,
  DownloadManagerSnapshot,
  DownloadSettings,
  DownloadTaskRecord,
  EnqueueDownloadInput,
} from '../types';

export interface InstallCompleteEntry {
  taskId: string;
  resourceId: number;
  localModId?: string | null;
  status: string;
}

export interface UseDownloadManagerParams {
  onInstallComplete?: (entry: InstallCompleteEntry) => void;
  notify: (type: 'success' | 'error' | 'info', msg: string) => void;
}

export interface DownloadSummary {
  activeTasks: DownloadTaskRecord[];
  runningTasks: DownloadTaskRecord[];
  pausedTasks: DownloadTaskRecord[];
  queuedTasks: DownloadTaskRecord[];
  failedTasks: DownloadTaskRecord[];
  totalSpeedBps: number;
  overallPercent: number;
  isPausedAll: boolean;
  hasVisibleActivity: boolean;
}

const EMPTY_SNAPSHOT: DownloadManagerSnapshot = {
  tasks: [],
  history: [],
  settings: { maxConcurrent: 2, speedLimitBps: 0, postDownloadMode: 'enabled', addToActiveProfile: true },
};

const RUNNING_STATUSES = new Set(['downloading', 'resolving', 'verifying']);
const ACTIVE_STATUSES = new Set(['queued', 'downloading', 'resolving', 'verifying', 'paused']);
const FAILED_STATUSES = new Set(['error', 'failed']);

export function useDownloadManager({ onInstallComplete, notify }: UseDownloadManagerParams) {
  const [snapshot, setSnapshot] = useState<DownloadManagerSnapshot>(EMPTY_SNAPSHOT);
  const [panelOpen, setPanelOpen] = useState(false);

  const onInstallCompleteRef = useRef(onInstallComplete);
  onInstallCompleteRef.current = onInstallComplete;
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const completedIdsRef = useRef<Set<string>>(new Set());

  const processCompletions = useCallback((history: DownloadHistoryEntry[]) => {
    for (const entry of history) {
      if ((entry.status === 'installed' || entry.status === 'staged') && !completedIdsRef.current.has(entry.taskId)) {
        completedIdsRef.current.add(entry.taskId);
        onInstallCompleteRef.current?.({
          taskId: entry.taskId,
          resourceId: entry.resourceId,
          localModId: entry.localModId,
          status: entry.status,
        });
      }
    }
  }, []);

  useEffect(() => {
    let active = true;
    let unlistenMgr: (() => void) | undefined;
    let unlistenProg: (() => void) | undefined;

    api.getDownloadManagerState()
      .then((initial) => {
        if (!active) return;
        for (const entry of initial.history) completedIdsRef.current.add(entry.taskId);
        setSnapshot(initial);
      })
      .catch((err) => active && notifyRef.current('error', `Failed to load download queue: ${String(err)}`));

    api.onDownloadManagerUpdated((next) => {
      if (!active) return;
      setSnapshot(next);
      processCompletions(next.history);
    }).then((fn) => (active ? (unlistenMgr = fn) : fn()));

    api.onDownloadProgress((p) => {
      if (!active) return;
      if ((p.status === 'installed' || p.status === 'staged') && !completedIdsRef.current.has(p.taskId)) {
        completedIdsRef.current.add(p.taskId);
        onInstallCompleteRef.current?.({ taskId: p.taskId, resourceId: p.resourceId, localModId: null, status: p.status });
      }
      setSnapshot((prev) => {
        const idx = prev.tasks.findIndex((t) => t.taskId === p.taskId);
        if (idx === -1) return prev;
        const tasks = prev.tasks.slice();
        tasks[idx] = {
          ...tasks[idx],
          filename: p.filename || tasks[idx].filename,
          downloadedBytes: p.downloadedBytes,
          totalBytes: p.totalBytes,
          speedBps: p.speedBps,
          status: p.status,
          message: p.message,
        };
        return { ...prev, tasks };
      });
    }).then((fn) => (active ? (unlistenProg = fn) : fn()));

    return () => {
      active = false;
      unlistenMgr?.();
      unlistenProg?.();
    };
  }, [processCompletions]);

  const runAction = useCallback(async (action: () => Promise<DownloadManagerSnapshot>) => {
    try {
      const next = await action();
      setSnapshot(next);
      processCompletions(next.history);
    } catch (err) {
      notifyRef.current('error', String(err));
    }
  }, [processCompletions]);

  const enqueueDownloads = useCallback((items: EnqueueDownloadInput[]) => runAction(() => api.enqueueDownloads(items)), [runAction]);
  const enqueueSingle = useCallback(
    (resourceId: number, slug: string, title: string) => enqueueDownloads([{ resourceId, slug, title }]),
    [enqueueDownloads],
  );
  const pauseTask = useCallback((taskId: string) => runAction(() => api.pauseDownload(taskId)), [runAction]);
  const pauseAll = useCallback(() => runAction(() => api.pauseAllDownloads()), [runAction]);
  const resumeTask = useCallback((taskId: string) => runAction(() => api.resumeDownload(taskId)), [runAction]);
  const resumeAll = useCallback(() => runAction(() => api.resumeAllDownloads()), [runAction]);
  const prioritizeTask = useCallback((taskId: string) => runAction(() => api.prioritizeDownload(taskId)), [runAction]);
  const retryTask = useCallback((taskId: string) => runAction(() => api.retryDownload(taskId)), [runAction]);
  const retryAllFailed = useCallback(() => runAction(() => api.retryAllFailedDownloads()), [runAction]);
  const cancelTask = useCallback(
    (taskId: string) => runAction(() => api.cancelDownload(taskId).then(() => api.getDownloadManagerState())),
    [runAction],
  );
  const cancelAll = useCallback(() => runAction(() => api.cancelAllDownloads()), [runAction]);
  const updateSettings = useCallback((s: DownloadSettings) => runAction(() => api.updateDownloadSettings(s)), [runAction]);
  const clearHistory = useCallback(() => runAction(() => api.clearDownloadHistory()), [runAction]);

  const summary = useMemo<DownloadSummary>(() => {
    const activeTasks = snapshot.tasks.filter((t) => ACTIVE_STATUSES.has(t.status));
    const runningTasks = activeTasks.filter((t) => RUNNING_STATUSES.has(t.status));
    const pausedTasks = activeTasks.filter((t) => t.status === 'paused');
    const queuedTasks = activeTasks.filter((t) => t.status === 'queued');
    const failedTasks = snapshot.tasks.filter((t) => FAILED_STATUSES.has(t.status));
    const totalSpeedBps = runningTasks.reduce((sum, t) => sum + (t.speedBps || 0), 0);
    const knownTotal = activeTasks.reduce((sum, t) => sum + (t.totalBytes > 0 ? t.totalBytes : 0), 0);
    const knownDone = activeTasks.reduce((sum, t) => sum + (t.totalBytes > 0 ? Math.min(t.downloadedBytes, t.totalBytes) : 0), 0);
    const overallPercent = knownTotal > 0 ? Math.min(100, Math.round((knownDone / knownTotal) * 100)) : 0;
    const isPausedAll = activeTasks.length > 0 && runningTasks.length === 0 && queuedTasks.length === 0 && pausedTasks.length > 0;
    return {
      activeTasks, runningTasks, pausedTasks, queuedTasks, failedTasks,
      totalSpeedBps, overallPercent, isPausedAll,
      hasVisibleActivity: activeTasks.length > 0 || failedTasks.length > 0,
    };
  }, [snapshot.tasks]);

  return {
    snapshot, tasks: snapshot.tasks, history: snapshot.history, settings: snapshot.settings,
    summary, panelOpen, setPanelOpen, enqueueDownloads, enqueueSingle,
    pauseTask, pauseAll, resumeTask, resumeAll, prioritizeTask,
    retryTask, retryAllFailed, cancelTask, cancelAll, updateSettings, clearHistory,
  };
}

export type DownloadManagerController = ReturnType<typeof useDownloadManager>;
