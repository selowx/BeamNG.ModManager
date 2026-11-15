import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { api } from '../api';
import type { BeamNGConfig, BridgeStatus, LocalMod } from '../types';
import { UI_TEXT } from '../i18n';
import type { ActiveTab } from '../utils';

export interface UseAppLifecycleParams {
  activeTab: ActiveTab;
  config: BeamNGConfig | null;
  setConfig: Dispatch<SetStateAction<BeamNGConfig | null>>;
  bridgeStatus: BridgeStatus | null;
  setBridgeStatus: Dispatch<SetStateAction<BridgeStatus | null>>;
  isBridgeReachable: boolean;
  repoSource: string | null;
  repoCategory: string;
  repoSort: string;
  repoPage: number;
  repoQuery: string;
  loadRepoPage: (cat: string, sort: string, page: number, query: string, force?: boolean) => Promise<void>;
  refreshOpenDrawer: () => Promise<void>;
  refreshConfigAndLocal: () => Promise<LocalMod[]>;
  showToast: (text: string, type?: 'info' | 'success' | 'error') => void;
}

export function useAppLifecycle({
  activeTab, config, setConfig, bridgeStatus, setBridgeStatus, isBridgeReachable,
  repoSource, repoCategory, repoSort, repoPage, repoQuery, loadRepoPage,
  refreshOpenDrawer, refreshConfigAndLocal, showToast,
}: UseAppLifecycleParams) {
  const [splashVisible, setSplashVisible] = useState(true);
  const [splashExiting, setSplashExiting] = useState(false);

  const activeTabRef = useRef(activeTab); activeTabRef.current = activeTab;
  const repoStateRef = useRef({ repoSource, repoCategory, repoSort, repoPage, repoQuery, loadRepoPage });
  repoStateRef.current = { repoSource, repoCategory, repoSort, repoPage, repoQuery, loadRepoPage };
  const refreshOpenDrawerRef = useRef(refreshOpenDrawer); refreshOpenDrawerRef.current = refreshOpenDrawer;
  const prevReachableRef = useRef<boolean | null>(null);

  useEffect(() => {
    const startTs = Date.now();
    refreshConfigAndLocal().then((mods) => {
      setTimeout(() => {
        setSplashExiting(true);
        if (mods?.length) showToast(`${mods.length} ${UI_TEXT.modsReadyToast}`, 'info');
        setTimeout(() => setSplashVisible(false), 480);
      }, Math.max(0, 1250 - (Date.now() - startTs)));
    });
    const timer = setInterval(() => { api.getConfig().then(setConfig).catch(() => {}); }, 5000);
    return () => clearInterval(timer);
  }, [refreshConfigAndLocal, setConfig, showToast]);

  useEffect(() => {
    if (activeTab === 'repo') api.getBridgeStatus().then(setBridgeStatus).catch(() => {});
  }, [activeTab, config?.gameRunning, setBridgeStatus]);

  const shouldPollBridge = Boolean(config?.gameRunning && bridgeStatus?.installed && bridgeStatus?.enabled);
  const bridgePollMs = bridgeStatus?.reachable && bridgeStatus?.extensionReady && bridgeStatus?.onlineFeatures ? 8000 : 2000;
  useEffect(() => {
    if (!shouldPollBridge) return;
    const timer = setInterval(() => { api.getBridgeStatus().then(setBridgeStatus).catch(() => {}); }, bridgePollMs);
    return () => clearInterval(timer);
  }, [shouldPollBridge, bridgePollMs, setBridgeStatus]);

  useEffect(() => {
    if (!bridgeStatus) return;
    const wasReachable = prevReachableRef.current;
    prevReachableRef.current = isBridgeReachable;
    if (wasReachable === false && isBridgeReachable) {
      showToast('BeamNG Game Bridge connected', 'success');
      void refreshConfigAndLocal();
      const r = repoStateRef.current;
      if (activeTabRef.current === 'repo' && r.repoSource === 'game_bridge') {
        void r.loadRepoPage(r.repoCategory, r.repoSort, r.repoPage, r.repoQuery, true);
      }
      void refreshOpenDrawerRef.current();
    }
  }, [bridgeStatus, isBridgeReachable, refreshConfigAndLocal, showToast]);

  useEffect(() => {
    const onManualStatus = (e: Event) => {
      const next = (e as CustomEvent<BridgeStatus>).detail;
      if (!next) return;
      setBridgeStatus(next);
      if (!next.reachable || !next.extensionReady) {
        showToast('Bridge not reachable yet. Press Ctrl+L inside BeamNG or restart.', 'info');
      }
    };
    window.addEventListener('modmanager:bridge-status', onManualStatus);
    return () => window.removeEventListener('modmanager:bridge-status', onManualStatus);
  }, [setBridgeStatus, showToast]);

  useEffect(() => {
    let uDrop: (() => void) | undefined, uLocal: (() => void) | undefined;
    api.onFileDrop(async (paths) => {
      const zips = paths.filter((p) => p.toLowerCase().endsWith('.zip'));
      if (!zips.length) return showToast('Please drop a valid .zip mod archive.', 'error');
      try { const count = await api.importZips(zips); showToast(`Imported ${count} external ZIP mod(s).`, 'success'); await refreshConfigAndLocal(); }
      catch (err) { showToast(`ZIP import error: ${String(err)}`, 'error'); }
    }).then((fn) => { uDrop = fn; });
    api.onLocalModsChanged(() => { void refreshConfigAndLocal(); }).then((fn) => { uLocal = fn; });
    const onFocus = () => { api.checkLocalModsChanged().then((changed) => { if (changed) void refreshConfigAndLocal(); }).catch(() => {}); };
    window.addEventListener('focus', onFocus);
    return () => { uDrop?.(); uLocal?.(); window.removeEventListener('focus', onFocus); };
  }, [refreshConfigAndLocal, showToast]);

  return { splashVisible, splashExiting };
}
