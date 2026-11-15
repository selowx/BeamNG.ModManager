import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { LocalMod, RepoHydrateTarget, RepoModItem, RepoWebStatus } from '../types';
import type { ActiveTab } from '../utils';

interface UseRepoBrowserOptions {
  activeTab: ActiveTab;
  bridgeConnected?: boolean;
  showToast: (text: string, type?: 'info' | 'success' | 'error') => void;
  onNavigateToRepo?: () => void;
}

function normalizeTitle(title?: string | null): string {
  return (title || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeVersion(version?: string | null): string {
  return (version || '').trim().replace(/^v/i, '').toLowerCase();
}

function resolveInstallStatus(item: RepoModItem, lm: LocalMod): string {
  if (lm.location === 'staging') return 'staged';
  const itemVer = normalizeVersion(item.version);
  const localVer = normalizeVersion(lm.version);
  if (lm.hasUpdate || (itemVer && localVer && itemVer !== localVer)) {
    return 'update_available';
  }
  return lm.active ? 'installed' : 'disabled';
}

function reconcileRepoItemsWithLocal(
  items: RepoModItem[],
  mods: LocalMod[]
): { next: RepoModItem[]; changed: boolean } {
  if (!items.length) return { next: items, changed: false };
  const byTag = new Map<string, LocalMod>();
  const byId = new Map<number, LocalMod>();
  const byTitle = new Map<string, LocalMod>();
  for (const m of mods) {
    if (m.tagId) byTag.set(m.tagId.trim().toUpperCase(), m);
    if (m.resourceId != null && m.resourceId > 0) byId.set(m.resourceId, m);
    const norm = normalizeTitle(m.title);
    if (norm) byTitle.set(norm, m);
  }
  let changed = false;
  const next = items.map((item) => {
    const tagKey = item.tagId ? item.tagId.trim().toUpperCase() : '';
    const lm =
      (tagKey ? byTag.get(tagKey) : undefined) ??
      (item.resourceId > 0 ? byId.get(item.resourceId) : undefined) ??
      byTitle.get(normalizeTitle(item.title));
    if (lm) {
      const installStatus = resolveInstallStatus(item, lm);
      const tagId = item.tagId ?? lm.tagId ?? null;
      const subscribed = item.subscribed ?? lm.subscribed;
      if (
        item.installStatus === installStatus &&
        item.installedVersion === lm.version &&
        item.localModId === lm.id &&
        (item.tagId ?? null) === tagId &&
        item.subscribed === subscribed
      ) {
        return item;
      }
      changed = true;
      return { ...item, installStatus, installedVersion: lm.version, localModId: lm.id, tagId, subscribed };
    }
    if (item.installStatus === 'not_installed' && !item.installedVersion && !item.localModId) return item;
    changed = true;
    return { ...item, installStatus: 'not_installed', installedVersion: null, localModId: null };
  });
  return { next: changed ? next : items, changed };
}

export function useRepoBrowser({ activeTab, bridgeConnected = false, showToast, onNavigateToRepo }: UseRepoBrowserOptions) {
  const [repoItems, setRepoItems] = useState<RepoModItem[]>([]);
  const [repoLoading, setRepoLoading] = useState(false);
  const [repoCategory, setRepoCategory] = useState('all');
  const [repoSort, setRepoSort] = useState('last_update');
  const [repoPage, setRepoPage] = useState(1);
  const [repoTotalPages, setRepoTotalPages] = useState(1);
  const [repoPerPage, setRepoPerPage] = useState<number>(
    () => Number(localStorage.getItem('modmanager_repo_per_page')) || 12
  );
  const [repoSearchInput, setRepoSearchInput] = useState('');
  const [repoQuery, setRepoQuery] = useState('');
  const [repoSource, setRepoSource] = useState<string | null>(null);
  const [repoError, setRepoError] = useState<string | null>(null);
  const [webStatus, setWebStatus] = useState<RepoWebStatus | null>(null);

  const requestGenRef = useRef(0);
  const attemptedHydrateRef = useRef<{ gen: number; ids: Set<number> }>({ gen: 0, ids: new Set() });
  const localModsRef = useRef<LocalMod[]>([]);
  const localModsSyncedRef = useRef(false);
  const needsBridgeReloadRef = useRef(false);
  const bridgeConnectedRef = useRef(bridgeConnected);
  bridgeConnectedRef.current = bridgeConnected;
  const repoSourceRef = useRef(repoSource);
  repoSourceRef.current = repoSource;

  const handleSetRepoPerPage = useCallback((n: number) => {
    setRepoPerPage(n);
    setRepoPage(1);
    localStorage.setItem('modmanager_repo_per_page', String(n));
  }, []);

  const loadRepoPage = useCallback(
    async (cat: string, sort: string, page: number, q: string, force = false) => {
      const gen = ++requestGenRef.current;
      attemptedHydrateRef.current = { gen, ids: new Set() };
      setRepoLoading(true);
      setRepoError(null);
      try {
        const res = await api.fetchRepoMods(cat, sort, page, q, force, repoPerPage);
        if (requestGenRef.current !== gen) return;
        const reconciled = localModsSyncedRef.current
          ? reconcileRepoItemsWithLocal(res.items, localModsRef.current).next
          : res.items;
        setRepoItems(reconciled);
        setRepoTotalPages(res.totalPages);
        setRepoSource(res.repoSource ?? null);
        setRepoError(null);
      } catch (err) {
        if (requestGenRef.current === gen) {
          const errMsg = String(err);
          setRepoError(errMsg);
          if (cat === 'subscribed') {
            setRepoItems([]);
            setRepoSource(null);
          } else {
            setRepoSource((s) => (s === 'game_bridge' ? s : null));
          }
          showToast(`Failed to fetch repository data: ${errMsg}`, 'error');
        }
      } finally {
        const ws = await api.getRepoWebStatus().catch(() => null);
        if (requestGenRef.current === gen) {
          if (ws) setWebStatus(ws);
          setRepoLoading(false);
        }
      }
    },
    [repoPerPage, showToast]
  );

  const hasCooldown = (webStatus?.cooldownRemainingSecs ?? 0) > 0;
  useEffect(() => {
    if (!hasCooldown) return;
    const timer = setInterval(() => {
      setWebStatus((prev) => {
        if (!prev || prev.cooldownRemainingSecs <= 0) return prev;
        const nextSecs = Math.max(0, prev.cooldownRemainingSecs - 1);
        return {
          ...prev,
          cooldownRemainingSecs: nextSecs,
          rateLimited: nextSecs > 0 ? prev.rateLimited : false,
        };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [hasCooldown]);

  useEffect(() => {
    if (activeTab === 'repo') {
      const force =
        needsBridgeReloadRef.current ||
        (bridgeConnectedRef.current && repoSourceRef.current !== 'game_bridge');
      needsBridgeReloadRef.current = false;
      void loadRepoPage(repoCategory, repoSort, repoPage, repoQuery, force);
    }
  }, [activeTab, repoCategory, repoSort, repoPage, repoQuery, loadRepoPage]);

  useEffect(() => {
    if (activeTab !== 'repo' || repoLoading || repoSource === 'game_bridge' || /^\d+$/.test(repoQuery.trim())) return;
    const gen = requestGenRef.current;
    if (attemptedHydrateRef.current.gen !== gen) {
      attemptedHydrateRef.current = { gen, ids: new Set() };
    }
    const targets: RepoHydrateTarget[] = [];
    const seen = new Set<number>();
    for (const item of repoItems.slice(0, repoPerPage)) {
      if (item.hydrated === false && !seen.has(item.resourceId) && !attemptedHydrateRef.current.ids.has(item.resourceId)) {
        seen.add(item.resourceId);
        targets.push({ resourceId: item.resourceId, slug: item.slug });
        if (targets.length >= 12) break;
      }
    }
    if (!targets.length) return;
    for (const t of targets) attemptedHydrateRef.current.ids.add(t.resourceId);

    api.hydrateRepoItems(targets).then((hydrated) => {
      if (requestGenRef.current !== gen || !hydrated?.length) return;
      const map = new Map(hydrated.map((h) => [h.resourceId, h]));
      setRepoItems((prev) => {
        const merged = prev.map((it) => map.get(it.resourceId) ?? it);
        return localModsSyncedRef.current ? reconcileRepoItemsWithLocal(merged, localModsRef.current).next : merged;
      });
    }).catch(() => {});
  }, [activeTab, repoItems, repoLoading, repoPerPage, repoQuery, repoSource]);

  const prevBridgeConnectedRef = useRef(bridgeConnected);
  useEffect(() => {
    const wasConnected = prevBridgeConnectedRef.current;
    prevBridgeConnectedRef.current = bridgeConnected;
    if (!wasConnected && bridgeConnected) {
      if (activeTab === 'repo' && (repoSource !== 'game_bridge' || Boolean(repoError))) {
        needsBridgeReloadRef.current = false;
        void loadRepoPage(repoCategory, repoSort, repoPage, repoQuery, true);
      } else if (activeTab !== 'repo' && repoSource !== 'game_bridge') {
        needsBridgeReloadRef.current = true;
      }
    }
  }, [bridgeConnected, activeTab, repoSource, repoError, repoCategory, repoSort, repoPage, repoQuery, loadRepoPage]);

  const handleSearchInRepo = useCallback((q: string) => {
    onNavigateToRepo?.();
    setRepoSearchInput(q);
    setRepoQuery(q);
    setRepoPage(1);
  }, [onNavigateToRepo]);

  const syncRepoStatusFromLocal = useCallback((mods: LocalMod[]) => {
    localModsRef.current = mods;
    localModsSyncedRef.current = true;
    setRepoItems((prev) => {
      const { next, changed } = reconcileRepoItemsWithLocal(prev, mods);
      return changed ? next : prev;
    });
  }, []);

  const markRepoItemStatus = useCallback((resourceId: number, status: string) => {
    setRepoItems((prev) => prev.map((it) => (it.resourceId === resourceId ? { ...it, installStatus: status } : it)));
  }, []);

  const updateRepoItemSubscription = useCallback(
    (tagId: string, resourceId: number | undefined, subscribed: boolean, deletedLocal = false) => {
      const upperTag = tagId ? tagId.trim().toUpperCase() : '';
      setRepoItems((prev) =>
        prev.map((it) => {
          const byTag = Boolean(upperTag && it.tagId && it.tagId.trim().toUpperCase() === upperTag);
          const byRes = Boolean(resourceId && resourceId > 0 && it.resourceId === resourceId);
          if (!byTag && !byRes) return it;
          return {
            ...it,
            subscribed,
            ...(deletedLocal ? { installStatus: 'not_installed', installedVersion: null, localModId: null } : {}),
          };
        })
      );
    },
    []
  );

  return {
    repoItems, repoLoading, repoCategory, setRepoCategory, repoSort, setRepoSort,
    repoPage, setRepoPage, repoTotalPages, repoPerPage, handleSetRepoPerPage,
    repoSearchInput, setRepoSearchInput, repoQuery, setRepoQuery, repoSource,
    repoError, webStatus, loadRepoPage, handleSearchInRepo, syncRepoStatusFromLocal,
    markRepoItemStatus, updateRepoItemSubscription,
  };
}
