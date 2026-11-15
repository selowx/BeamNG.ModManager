import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { api } from '../api';
import type { EnqueueDownloadInput, LocalMod, RepoModItem, ScanReport } from '../types';
import { matchesCategory, type LocalFilter } from '../utils';

export interface UseLocalModActionsParams {
  localMods: LocalMod[];
  setLocalMods: Dispatch<SetStateAction<LocalMod[]>>;
  refreshConfigAndLocal: () => Promise<LocalMod[]>;
  enqueueDownloads: (items: EnqueueDownloadInput[]) => Promise<void>;
  setSelectedLocalMod: Dispatch<SetStateAction<LocalMod | null>>;
  setSelectedMod: Dispatch<SetStateAction<RepoModItem | null>>;
  showToast: (text: string, type?: 'info' | 'success' | 'error') => void;
}

export function useLocalModActions({
  localMods, setLocalMods, refreshConfigAndLocal, enqueueDownloads,
  setSelectedLocalMod, setSelectedMod, showToast,
}: UseLocalModActionsParams) {
  const [localSearch, setLocalSearch] = useState('');
  const [localFilter, setLocalFilter] = useState<LocalFilter>('all');
  const [localCategory, setLocalCategory] = useState('all');
  const [localLoading, setLocalLoading] = useState(false);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [busyModIds, setBusyModIds] = useState<Record<string, boolean>>({});
  const [scanReport, setScanReport] = useState<ScanReport | null>(null);
  const [scanning, setScanning] = useState(false);

  const handleToggleMod = useCallback(async (mod: LocalMod) => {
    const next = !mod.active;
    setBusyModIds((prev) => ({ ...prev, [mod.id]: true }));
    setLocalMods((prev) => prev.map((m) => (m.id === mod.id ? { ...m, active: next, location: next ? m.originDir : 'disabled' } : m)));
    setSelectedLocalMod((prev) => (prev?.id === mod.id ? { ...prev, active: next, location: next ? prev.originDir : 'disabled' } : prev));
    setSelectedMod((prev) => (prev?.localModId === mod.id ? { ...prev, installStatus: next ? 'installed' : 'disabled' } : prev));
    try { await api.toggleMod(mod.id, next); }
    catch (err) { showToast(`Failed to toggle mod: ${String(err)}`, 'error'); await refreshConfigAndLocal(); }
    finally { setBusyModIds((prev) => ({ ...prev, [mod.id]: false })); }
  }, [refreshConfigAndLocal, setLocalMods, setSelectedLocalMod, setSelectedMod, showToast]);

  const handleTogglePin = useCallback(async (mod: LocalMod) => {
    try {
      const pinned = await api.togglePin(mod.id);
      setLocalMods((prev) => prev.map((m) => (m.id === mod.id ? { ...m, pinned } : m)));
      showToast(pinned ? `${mod.title} protected (pinned).` : `${mod.title} unpinned.`, 'info');
    } catch (err) { showToast(`Failed to update pin: ${String(err)}`, 'error'); }
  }, [setLocalMods, showToast]);

  const handleDeleteMod = useCallback(async (mod: LocalMod) => {
    if (mod.pinned) return showToast('Protected mod cannot be deleted.', 'error');
    try {
      await api.removeLocalMod(mod.id);
      setLocalMods((prev) => prev.filter((m) => m.id !== mod.id));
      setSelectedLocalMod((prev) => (prev?.id === mod.id ? null : prev));
      setSelectedMod((prev) => (prev?.localModId === mod.id ? { ...prev, installStatus: 'not_installed', installedVersion: null, localModId: null } : prev));
      showToast(`Deleted ${mod.title}.`, 'success');
    } catch (err) { showToast(`Delete failed: ${String(err)}`, 'error'); }
  }, [setLocalMods, setSelectedLocalMod, setSelectedMod, showToast]);

  const handleBulkToggle = useCallback(async (mods: LocalMod[], targetActive: boolean) => {
    const ids = mods.filter((m) => targetActive || !m.pinned).map((m) => m.id);
    if (!ids.length) return showToast('No unlocked mods to update.', 'info');
    setLocalLoading(true);
    try {
      const count = await api.bulkToggleMods(ids, targetActive);
      showToast(`${count} mod(s) ${targetActive ? 'enabled' : 'moved to mods_disabled'}.`, 'success');
      await refreshConfigAndLocal();
    } catch (err) { showToast(`Bulk operation failed: ${String(err)}`, 'error'); }
    finally { setLocalLoading(false); }
  }, [refreshConfigAndLocal, showToast]);

  const handleCheckUpdates = useCallback(async () => {
    setCheckingUpdates(true);
    showToast('Checking for mod updates...', 'info');
    try {
      const list = await api.checkModUpdates();
      setLocalMods(list);
      const count = list.filter((m) => m.hasUpdate).length;
      if (count > 0) { showToast(`Found ${count} mod update(s)!`, 'success'); setLocalFilter('updates'); }
      else showToast('All installed mods are up to date!', 'success');
    } catch (err) { showToast(`Update check failed: ${String(err)}`, 'error'); }
    finally { setCheckingUpdates(false); }
  }, [setLocalFilter, setLocalMods, showToast]);

  const handleUpdateAll = useCallback(async () => {
    const seen = new Set<number>();
    const items: EnqueueDownloadInput[] = [];
    for (const mod of localMods) {
      if (!mod.hasUpdate || !mod.resourceId || seen.has(mod.resourceId)) continue;
      seen.add(mod.resourceId);
      items.push({ resourceId: mod.resourceId, slug: mod.latestSlug || `resources/${mod.resourceId}/`, title: mod.title });
    }
    if (!items.length) return showToast('No updatable mods with Repo metadata found.', 'info');
    await enqueueDownloads(items);
    showToast(`Queued ${items.length} mod update(s).`, 'success');
  }, [enqueueDownloads, localMods, showToast]);

  const handleSyncStaged = useCallback(async () => {
    try {
      const moved = await api.applyStagedMods();
      showToast(`Applied ${moved} staged mod(s)!`, 'success');
      await refreshConfigAndLocal();
    } catch (err) { showToast(`Failed to apply staged mods: ${String(err)}`, 'error'); }
  }, [refreshConfigAndLocal, showToast]);

  const handleRunHealthScan = useCallback(async () => {
    setScanning(true);
    try { const r = await api.runHealthScan(); setScanReport(r); showToast(`Scanned ${r.totalModsScanned} archives!`, 'success'); }
    catch (err) { showToast(`Health scan failed: ${String(err)}`, 'error'); }
    finally { setScanning(false); }
  }, [showToast]);

  const handleDisableConflictMod = useCallback(async (filename: string) => {
    const fn = filename.toLowerCase();
    const mod = localMods.find((m) => m.filename.toLowerCase() === fn || m.id.toLowerCase() === fn);
    if (!mod) return showToast(`Mod not found: ${filename}`, 'error');
    if (mod.pinned) return showToast('Protected mod cannot be disabled.', 'error');
    try {
      await api.toggleMod(mod.id, false);
      await refreshConfigAndLocal();
      setScanReport(await api.runHealthScan());
      showToast(`Disabled ${mod.filename} and refreshed scan.`, 'success');
    } catch (err) { showToast(`Failed to disable mod: ${String(err)}`, 'error'); }
  }, [localMods, refreshConfigAndLocal, showToast]);

  const localStats = useMemo(() => {
    const total = localMods.length, active = localMods.filter((m) => m.active).length;
    return {
      total, active, disabled: total - active,
      pinned: localMods.filter((m) => m.pinned).length,
      updates: localMods.filter((m) => m.hasUpdate).length,
      totalBytes: localMods.reduce((acc, m) => acc + m.sizeBytes, 0),
    };
  }, [localMods]);

  const filteredLocalMods = useMemo(() => {
    const q = localSearch.trim().toLowerCase();
    return localMods.filter((m) => (
      (localFilter !== 'active' || m.active) &&
      (localFilter !== 'disabled' || !m.active) &&
      (localFilter !== 'pinned' || m.pinned) &&
      (localFilter !== 'updates' || m.hasUpdate) &&
      matchesCategory(m.category, localCategory) &&
      (!q || m.title.toLowerCase().includes(q) || m.filename.toLowerCase().includes(q) || m.author.toLowerCase().includes(q))
    ));
  }, [localMods, localSearch, localFilter, localCategory]);

  return {
    localSearch, setLocalSearch, localFilter, setLocalFilter, localCategory, setLocalCategory,
    localStats, filteredLocalMods, localLoading, checkingUpdates, busyModIds, scanReport, scanning,
    handleToggleMod, handleTogglePin, handleDeleteMod, handleBulkToggle,
    handleCheckUpdates, handleUpdateAll, handleSyncStaged, handleRunHealthScan, handleDisableConflictMod,
  };
}
