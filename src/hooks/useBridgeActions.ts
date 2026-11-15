import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { BridgeStatus, LocalMod, RepoModDetails, RepoModItem } from '../types';
import { formatBytes } from '../utils';

function matchesLocalMod(m: LocalMod, tagId: string, resourceId?: number, localModId?: string | null): boolean {
  if (localModId && m.id === localModId) return true;
  if (tagId && m.tagId && m.tagId.trim().toUpperCase() === tagId.trim().toUpperCase()) return true;
  if (resourceId && resourceId > 0 && m.resourceId === resourceId) return true;
  return false;
}

interface UseBridgeActionsOptions {
  bridgeStatus: BridgeStatus | null;
  setBridgeStatus: React.Dispatch<React.SetStateAction<BridgeStatus | null>>;
  localMods: LocalMod[];
  setLocalMods: React.Dispatch<React.SetStateAction<LocalMod[]>>;
  showToast: (text: string, type?: 'info' | 'success' | 'error') => void;
  refreshConfigAndLocal: () => Promise<LocalMod[]>;
  updateRepoItemSubscription: (
    tagId: string,
    resourceId: number | undefined,
    subscribed: boolean,
    deletedLocal?: boolean
  ) => void;
}

export function useBridgeActions({
  bridgeStatus,
  setBridgeStatus,
  localMods,
  setLocalMods,
  showToast,
  refreshConfigAndLocal,
  updateRepoItemSubscription,
}: UseBridgeActionsOptions) {
  const [bridgeBusy, setBridgeBusy] = useState(false);
  const [subBusy, setSubBusy] = useState(false);
  const [selectedMod, setSelectedMod] = useState<RepoModItem | null>(null);
  const [selectedLocalMod, setSelectedLocalMod] = useState<LocalMod | null>(null);
  const [modDetails, setModDetails] = useState<RepoModDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const runBridgeAction = useCallback(
    async (fn: () => Promise<BridgeStatus>, msg: (s: BridgeStatus) => string): Promise<BridgeStatus | null> => {
      setBridgeBusy(true);
      try {
        const next = await fn();
        setBridgeStatus(next);
        showToast(msg(next), 'success');
        return next;
      } catch (err) {
        showToast(`Bridge action failed: ${String(err)}`, 'error');
        return null;
      } finally {
        setBridgeBusy(false);
      }
    },
    [setBridgeStatus, showToast]
  );

  const handleInstallBridge = useCallback(
    () =>
      void runBridgeAction(
        () => api.installBridgeExtension(),
        (s) => (s.reachable ? 'Bridge installed and connected.' : 'Bridge installed. Restart BeamNG or press Ctrl+L if running.')
      ),
    [runBridgeAction]
  );

  const handleReinstallBridge = useCallback(() => {
    const isUpdate = Boolean(bridgeStatus?.outdated);
    void runBridgeAction(
      () => api.installBridgeExtension(),
      (s) => {
        const needsReload = Boolean(
          s.gameRunning && s.runningVersion && s.bundledVersion && s.runningVersion !== s.bundledVersion
        );
        if (isUpdate) {
          const ver = s.installedVersion || s.bundledVersion;
          const verText = ver ? ` to v${ver}` : '';
          if (needsReload) return `Bridge updated${verText} on disk. Press Ctrl+L or restart BeamNG to load it.`;
          return s.reachable
            ? `Bridge updated${verText} and connected.`
            : `Bridge updated${verText}. Restart BeamNG or press Ctrl+L if running.`;
        }
        if (needsReload) return 'Bridge files rewritten on disk. Press Ctrl+L or restart BeamNG to reload.';
        return s.reachable
          ? 'Bridge reinstalled and connected.'
          : 'Bridge files rewritten. Restart BeamNG or press Ctrl+L if running.';
      }
    );
  }, [bridgeStatus?.outdated, runBridgeAction]);

  const handleUninstallBridge = useCallback(
    () => void runBridgeAction(() => api.uninstallBridgeExtension(), () => 'Bridge mod removed. Using Web Catalog.'),
    [runBridgeAction]
  );

  const handleToggleBridgeEnabled = useCallback(
    (): Promise<BridgeStatus | null> =>
      runBridgeAction(
        () => api.updateBridgeSettings(!(bridgeStatus?.enabled ?? true), bridgeStatus?.port ?? 23519),
        (s) => (s.enabled ? 'Bridge enabled.' : 'Bridge paused.')
      ),
    [bridgeStatus?.enabled, bridgeStatus?.port, runBridgeAction]
  );

  const selectedModRef = useRef<RepoModItem | null>(null);
  selectedModRef.current = selectedMod;

  useEffect(() => {
    setSelectedLocalMod((prev) => {
      if (!prev) return prev;
      const fresh = localMods.find((m) => m.id === prev.id);
      return fresh ?? prev;
    });
  }, [localMods]);

  const handleSubscribeMod = useCallback(
    async (tagId: string, resourceId?: number) => {
      setSubBusy(true);
      try {
        const res = await api.subscribeBridgeMod(tagId);
        if (!res.ok) { showToast(res.message || 'Subscribe failed.', 'error'); return; }
        updateRepoItemSubscription(tagId, resourceId, res.subscribed);
        setLocalMods((prev) => prev.map((m) => (matchesLocalMod(m, tagId, resourceId) ? { ...m, subscribed: res.subscribed, tagId: m.tagId || tagId } : m)));
        setSelectedLocalMod((prev) => (prev && matchesLocalMod(prev, tagId, resourceId) ? { ...prev, subscribed: res.subscribed, tagId: prev.tagId || tagId } : prev));
        setSelectedMod((prev) => (prev ? { ...prev, subscribed: res.subscribed, tagId: prev.tagId || tagId } : prev));
        setModDetails((prev) => (prev ? { ...prev, subscribed: res.subscribed } : prev));
        showToast(res.message || 'Subscribed to mod.', 'success');
      } catch (err) {
        showToast(`Subscribe failed: ${String(err)}`, 'error');
      } finally {
        setSubBusy(false);
      }
    },
    [setLocalMods, showToast, updateRepoItemSubscription]
  );

  const handleUnsubscribeMod = useCallback(
    async (tagId: string, deleteLocal: boolean, localModId: string | null, resourceId?: number) => {
      setSubBusy(true);
      try {
        const res = await api.unsubscribeBridgeMod(tagId, deleteLocal, localModId);
        if (!res.ok) { showToast(res.message || 'Unsubscribe failed.', 'error'); return; }
        updateRepoItemSubscription(tagId, resourceId, res.subscribed, deleteLocal);
        setSelectedMod((prev) =>
          prev ? { ...prev, subscribed: res.subscribed, ...(deleteLocal ? { installStatus: 'not_installed', installedVersion: null, localModId: null } : {}) } : prev
        );
        setModDetails((prev) =>
          prev ? { ...prev, subscribed: res.subscribed, ...(deleteLocal ? { installStatus: 'not_installed', installedVersion: null } : {}) } : prev
        );
        if (deleteLocal) {
          setSelectedLocalMod((prev) => (prev && matchesLocalMod(prev, tagId, resourceId, localModId) ? null : prev));
          setLocalMods((prev) => prev.filter((m) => !matchesLocalMod(m, tagId, resourceId, localModId)));
          await refreshConfigAndLocal();
        } else {
          setLocalMods((prev) => prev.map((m) => (matchesLocalMod(m, tagId, resourceId, localModId) ? { ...m, subscribed: res.subscribed } : m)));
          setSelectedLocalMod((prev) => (prev && matchesLocalMod(prev, tagId, resourceId, localModId) ? { ...prev, subscribed: res.subscribed } : prev));
        }
        showToast(res.message || (deleteLocal ? 'Unsubscribed and deleted ZIP.' : 'Unsubscribed from mod.'), 'success');
      } catch (err) {
        showToast(`Unsubscribe failed: ${String(err)}`, 'error');
      } finally {
        setSubBusy(false);
      }
    },
    [refreshConfigAndLocal, setLocalMods, showToast, updateRepoItemSubscription]
  );

  const handleOpenDetails = useCallback(
    async (item: RepoModItem) => {
      const localMatch =
        localMods.find((m) => matchesLocalMod(m, item.tagId || '', item.resourceId, item.localModId)) || null;
      setSelectedLocalMod(localMatch);
      setSelectedMod(item);
      setModDetails(null);
      setDetailsLoading(true);
      try {
        const d = await api.getRepoModDetails(item.slug, item.resourceId);
        setModDetails(d);
        setSelectedMod((prev) =>
          prev && prev.resourceId === item.resourceId
            ? { ...prev, subscribed: d.subscribed ?? prev.subscribed, tagId: prev.tagId || d.tagId }
            : prev
        );
      } catch (err) {
        showToast(`Failed to load mod details: ${String(err)}`, 'error');
      } finally {
        setDetailsLoading(false);
      }
    },
    [localMods, showToast]
  );

  const handleOpenLocalModPage = useCallback(
    async (mod: LocalMod) => {
      setSelectedLocalMod(mod);
      const slug = mod.latestSlug || (mod.resourceId ? `resources/${mod.resourceId}/` : '');
      setSelectedMod({
        resourceId: mod.resourceId || 0, slug, title: mod.title, version: mod.version, author: mod.author,
        tagline: mod.filename, category: mod.category, rating: 0, ratingCount: 0, downloads: 0, subscriptions: 0,
        updatedText: '', updatedTimestamp: mod.lastUpdate || mod.dateAdded, iconUrl: mod.iconUrl || '',
        installStatus: mod.hasUpdate ? 'update_available' : mod.active ? 'installed' : 'disabled',
        installedVersion: mod.version, localModId: mod.id, tagId: mod.tagId, subscribed: mod.subscribed,
      });
      const fallback: RepoModDetails = {
        resourceId: mod.resourceId || 0, slug, title: mod.title, version: mod.version, author: mod.author,
        tagline: mod.filename, descriptionText: mod.resourceId ? mod.title : 'External ZIP archive.',
        category: mod.category, rating: 0, downloads: 0, fileSizeText: formatBytes(mod.sizeBytes),
        tagId: mod.tagId, downloadUrl: null, iconUrl: mod.iconUrl || '', galleryImages: [],
        installStatus: mod.active ? 'installed' : 'disabled', installedVersion: mod.version, subscribed: mod.subscribed,
      };
      if (!mod.resourceId) { setDetailsLoading(false); setModDetails(fallback); return; }
      setModDetails(null);
      setDetailsLoading(true);
      try {
        const d = await api.getRepoModDetails(slug, mod.resourceId);
        setModDetails(d);
        if (d.subscribed != null) {
          setSelectedMod((prev) => (prev && prev.localModId === mod.id ? { ...prev, subscribed: d.subscribed } : prev));
        }
        if (d.installStatus === 'update_available' || (d.version && d.version.trim().replace(/^v/i, '') !== mod.version.trim().replace(/^v/i, ''))) {
          setLocalMods((prev) => prev.map((m) => (m.id === mod.id ? { ...m, hasUpdate: true, latestVersion: d.version, latestSlug: d.slug } : m)));
          setSelectedMod((prev) => (prev && prev.localModId === mod.id ? { ...prev, installStatus: 'update_available' } : prev));
        }
      } catch {
        setModDetails(fallback);
      } finally {
        setDetailsLoading(false);
      }
    },
    [setLocalMods]
  );

  const refreshOpenDrawer = useCallback(async () => {
    const cur = selectedModRef.current;
    if (!cur || !cur.resourceId) return;
    try {
      const d = await api.getRepoModDetails(cur.slug, cur.resourceId);
      if (selectedModRef.current?.resourceId !== cur.resourceId) return;
      setModDetails(d);
      setSelectedMod((prev) =>
        prev && prev.resourceId === cur.resourceId
          ? { ...prev, subscribed: d.subscribed ?? prev.subscribed, tagId: prev.tagId || d.tagId }
          : prev
      );
    } catch {
      // ignore transient errors during auto-refresh
    }
  }, []);

  const closeModDrawer = useCallback(() => {
    setSelectedMod(null);
    setSelectedLocalMod(null);
  }, []);

  return {
    bridgeBusy, subBusy, selectedMod, setSelectedMod, selectedLocalMod, setSelectedLocalMod,
    modDetails, detailsLoading, handleInstallBridge, handleReinstallBridge, handleUninstallBridge,
    handleToggleBridgeEnabled, handleSubscribeMod, handleUnsubscribeMod, handleOpenDetails,
    handleOpenLocalModPage, refreshOpenDrawer, closeModDrawer,
  };
}
