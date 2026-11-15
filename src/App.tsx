import { useCallback, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { api } from './api';
import type { BeamNGConfig, BridgeStatus, DownloadProgressPayload, LocalMod } from './types';
import type { ActiveTab } from './utils';
import { useRepoBrowser } from './hooks/useRepoBrowser';
import { useBridgeActions } from './hooks/useBridgeActions';
import { useGameLauncher } from './hooks/useGameLauncher';
import { useViewPreferences } from './hooks/useViewPreferences';
import { useDownloadManager } from './hooks/useDownloadManager';
import { useProfileManager } from './hooks/useProfileManager';
import { useLocalModActions } from './hooks/useLocalModActions';
import { useAppLifecycle } from './hooks/useAppLifecycle';
import { SplashScreen } from './components/SplashScreen';
import { HeaderBar } from './components/HeaderBar';
import { RepoExplorer } from './components/RepoExplorer';
import { LocalModsView } from './components/LocalModsView';
import { ProfilesView } from './components/profiles/ProfilesView';
import { SettingsInfoView } from './components/SettingsInfoView';
import { ModDetailDrawer } from './components/ModDetailDrawer';
import { DownloadMiniStrip } from './components/DownloadMiniStrip';
import { InputContextMenu } from './components/InputContextMenu';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('local'), [config, setConfig] = useState<BeamNGConfig | null>(null);
  const [toast, setToast] = useState<{ text: string; type: 'info' | 'success' | 'error' } | null>(null);
  const [localMods, setLocalMods] = useState<LocalMod[]>([]);
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus | null>(null);
  const bridgeConnected = Boolean(bridgeStatus?.installed && bridgeStatus?.enabled && bridgeStatus?.reachable && bridgeStatus?.onlineFeatures && bridgeStatus?.authenticated);

  const showToast = useCallback((text: string, type: 'info' | 'success' | 'error' = 'info') => {
    setToast({ text, type });
    setTimeout(() => setToast((prev) => (prev?.text === text ? null : prev)), 4000);
  }, []);
  const notify = useCallback((type: 'info' | 'success' | 'error', text: string) => showToast(text, type), [showToast]);

  const launcher = useGameLauncher({ config, setConfig, showToast });
  const viewPrefs = useViewPreferences();
  const closeDrawerRef = useRef<() => void>(() => {});
  const onNavigateToRepo = useCallback(() => { closeDrawerRef.current(); setActiveTab('repo'); }, []);
  const repo = useRepoBrowser({ activeTab, bridgeConnected, showToast, onNavigateToRepo });
  const { syncRepoStatusFromLocal, markRepoItemStatus, updateRepoItemSubscription } = repo;

  const refreshInFlightRef = useRef<Promise<LocalMod[]> | null>(null);
  const refreshQueuedRef = useRef(false);
  const refreshConfigAndLocal = useCallback(async (): Promise<LocalMod[]> => {
    if (refreshInFlightRef.current) { refreshQueuedRef.current = true; return refreshInFlightRef.current; }
    const run = (async () => {
      try {
        const [cfg, mods, bridge] = await Promise.all([api.getConfig(), api.getLocalMods(), api.getBridgeStatus().catch(() => null)]);
        setConfig(cfg);
        if (bridge) setBridgeStatus(bridge);
        setLocalMods((prev) => {
          const map = new Map(prev.map((m) => [m.id, m]));
          return mods.map((m) => { const old = map.get(m.id); return old && old.version === m.version && old.hasUpdate ? { ...m, hasUpdate: true, latestVersion: old.latestVersion, latestSlug: old.latestSlug } : m; });
        });
        syncRepoStatusFromLocal(mods);
        return mods;
      } catch (err) { showToast(`Failed to load configuration: ${String(err)}`, 'error'); return []; }
      finally { refreshInFlightRef.current = null; if (refreshQueuedRef.current) { refreshQueuedRef.current = false; void refreshConfigAndLocal(); } }
    })();
    refreshInFlightRef.current = run;
    return run;
  }, [showToast, syncRepoStatusFromLocal]);

  const reloadProfilesRef = useRef<() => Promise<unknown>>(() => Promise.resolve());
  const onInstallComplete = useCallback(({ resourceId, status }: { resourceId: number; status: string }) => {
    showToast(status === 'staged' ? 'Download staged for next sync.' : 'Mod download installed.', 'success');
    setLocalMods((prev) => prev.map((m) => (m.resourceId === resourceId ? { ...m, hasUpdate: false, latestVersion: null, latestSlug: null } : m)));
    void refreshConfigAndLocal();
    void reloadProfilesRef.current();
    markRepoItemStatus(resourceId, status);
  }, [markRepoItemStatus, refreshConfigAndLocal, showToast]);

  const downloadManager = useDownloadManager({ onInstallComplete, notify });
  const profileManager = useProfileManager({
    localMods,
    onQueueMissingDownloads: downloadManager.enqueueDownloads,
    refreshConfigAndLocal,
    notify,
  });
  reloadProfilesRef.current = profileManager.reloadProfiles;

  const bridge = useBridgeActions({
    bridgeStatus, setBridgeStatus, localMods, setLocalMods, showToast, refreshConfigAndLocal, updateRepoItemSubscription,
  });
  closeDrawerRef.current = bridge.closeModDrawer;

  const localActions = useLocalModActions({
    localMods, setLocalMods, refreshConfigAndLocal, enqueueDownloads: downloadManager.enqueueDownloads,
    setSelectedLocalMod: bridge.setSelectedLocalMod, setSelectedMod: bridge.setSelectedMod, showToast,
  });

  const isBridgeReachable = Boolean(bridgeStatus?.installed && bridgeStatus?.enabled && bridgeStatus?.reachable);
  const { splashVisible, splashExiting } = useAppLifecycle({
    activeTab, config, setConfig, bridgeStatus, setBridgeStatus, isBridgeReachable,
    repoSource: repo.repoSource, repoCategory: repo.repoCategory, repoSort: repo.repoSort, repoPage: repo.repoPage, repoQuery: repo.repoQuery,
    loadRepoPage: repo.loadRepoPage, refreshOpenDrawer: bridge.refreshOpenDrawer, refreshConfigAndLocal, showToast,
  });

  const handleInstallRepoMod = useCallback((resourceId: number, slug: string, title: string) => {
    showToast(`Added ${title} to download queue...`, 'info');
    void downloadManager.enqueueSingle(resourceId, slug, title);
  }, [downloadManager, showToast]);
  const handleApplyAndPlay = useCallback(async (profileId: string, keepPinnedOverride?: boolean) => {
    const res = await profileManager.applyProfile(profileId, keepPinnedOverride);
    if (res) void launcher.startBeamNG();
  }, [launcher, profileManager]);
  const handleProbeBridge = useCallback(async () => {
    try { const s = await api.getBridgeStatus(); setBridgeStatus(s); return s; } catch { return null; }
  }, []);

  const repoDownloads = useMemo<Record<string, DownloadProgressPayload>>(() => {
    const map: Record<string, DownloadProgressPayload> = {};
    for (const t of downloadManager.tasks) map[t.taskId] = { taskId: t.taskId, resourceId: t.resourceId, title: t.title, filename: t.filename, downloadedBytes: t.downloadedBytes, totalBytes: t.totalBytes, speedBps: t.speedBps, status: t.status, message: t.message ?? null };
    return map;
  }, [downloadManager.tasks]);
  const drawerDownloadStatus = bridge.selectedMod ? downloadManager.tasks.find((t) => t.resourceId === bridge.selectedMod?.resourceId)?.status : undefined;
  const showMiniStrip = activeTab !== 'local' && downloadManager.summary.hasVisibleActivity;

  return (
    <div className="flex flex-col h-screen w-screen bg-[#161922] text-zinc-100 select-none overflow-hidden font-sans">
      <SplashScreen visible={splashVisible} exiting={splashExiting} />
      <HeaderBar
        activeTab={activeTab} setActiveTab={setActiveTab} config={config} localTotal={localActions.localStats.total} localUpdates={localActions.localStats.updates}
        profileCount={profileManager.profiles.length} hasProfileDrift={profileManager.activeDrift.hasDrift}
        launchMode={launcher.launchMode} launchingGame={launcher.launchingGame} onSyncStaged={() => void localActions.handleSyncStaged()}
        onOpenModsFolder={() => api.openModFolder('mods')} onSelectLaunchMode={launcher.selectLaunchMode} onStartBeamNG={() => void launcher.startBeamNG()}
      />
      {toast && (
        <div className={`fixed ${showMiniStrip ? 'bottom-12' : 'bottom-5'} right-6 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-sm border text-xs font-medium transition-all ${toast.type === 'error' ? 'bg-[#140c0e] border-red-800/70 text-red-200' : toast.type === 'success' ? 'bg-[#0c1410] border-emerald-800/70 text-emerald-200' : 'bg-[#222733] border-[#ff6600]/60 text-zinc-100'}`}>
          <span>{toast.text}</span>
          <button onClick={() => setToast(null)} className="text-zinc-400 hover:text-white cursor-pointer"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}
      <main className="flex-1 overflow-hidden flex flex-col">
        {activeTab === 'repo' && (
          <RepoExplorer
            repoItems={repo.repoItems} repoLoading={repo.repoLoading} repoSource={repo.repoSource} repoError={repo.repoError}
            webStatus={repo.webStatus} bridgeConnected={bridgeConnected} bridgeStatus={bridgeStatus} bridgeBusy={bridge.bridgeBusy}
            repoCategory={repo.repoCategory} setRepoCategory={repo.setRepoCategory} repoSort={repo.repoSort} setRepoSort={repo.setRepoSort}
            repoPage={repo.repoPage} setRepoPage={repo.setRepoPage} repoTotalPages={repo.repoTotalPages} repoPerPage={repo.repoPerPage}
            setRepoPerPage={repo.handleSetRepoPerPage} repoSearchInput={repo.repoSearchInput} setRepoSearchInput={repo.setRepoSearchInput}
            setRepoQuery={repo.setRepoQuery} onRefresh={() => repo.loadRepoPage(repo.repoCategory, repo.repoSort, repo.repoPage, repo.repoQuery, true)}
            onOpenDetails={bridge.handleOpenDetails} onInstallMod={handleInstallRepoMod} onInstallBridge={bridge.handleInstallBridge}
            onReinstallBridge={bridge.handleReinstallBridge} onUninstallBridge={bridge.handleUninstallBridge}
            onToggleBridgeEnabled={bridge.handleToggleBridgeEnabled} gameRunning={Boolean(config?.gameRunning)}
            launchMode={launcher.launchMode} onLaunchBeamNG={() => void launcher.startBeamNG()} onProbeBridge={handleProbeBridge}
            downloads={repoDownloads} viewMode={viewPrefs.repoViewMode} onChangeViewMode={viewPrefs.setRepoViewMode}
          />
        )}
        {activeTab === 'local' && (
          <LocalModsView
            localMods={localMods} filteredLocalMods={localActions.filteredLocalMods} localStats={localActions.localStats}
            localFilter={localActions.localFilter} setLocalFilter={localActions.setLocalFilter}
            localCategory={localActions.localCategory} setLocalCategory={localActions.setLocalCategory}
            localSearch={localActions.localSearch} setLocalSearch={localActions.setLocalSearch}
            localLoading={localActions.localLoading} checkingUpdates={localActions.checkingUpdates} busyModIds={localActions.busyModIds}
            onCheckUpdates={() => void localActions.handleCheckUpdates()} onUpdateAll={() => void localActions.handleUpdateAll()}
            onBulkToggle={(m, a) => void localActions.handleBulkToggle(m, a)} onToggleMod={(m) => void localActions.handleToggleMod(m)}
            onTogglePin={(m) => void localActions.handleTogglePin(m)} onDeleteMod={(m) => void localActions.handleDeleteMod(m)}
            onInstallRepoMod={handleInstallRepoMod} onOpenModPage={bridge.handleOpenLocalModPage} downloadManager={downloadManager}
            viewMode={viewPrefs.localViewMode} onChangeViewMode={viewPrefs.setLocalViewMode}
          />
        )}
        {activeTab === 'profiles' && (
          <ProfilesView localMods={localMods} gameRunning={Boolean(config?.gameRunning)} manager={profileManager} onApplyAndPlay={handleApplyAndPlay} />
        )}
        {activeTab === 'settings' && (
          <SettingsInfoView
            config={config} bridgeStatus={bridgeStatus} launchMode={launcher.launchMode} onSelectLaunchMode={launcher.selectLaunchMode}
            repoViewMode={viewPrefs.repoViewMode} onChangeRepoViewMode={viewPrefs.setRepoViewMode}
            localViewMode={viewPrefs.localViewMode} onChangeLocalViewMode={viewPrefs.setLocalViewMode}
            onRefreshLocal={refreshConfigAndLocal} scanReport={localActions.scanReport} scanning={localActions.scanning}
            onRunHealthScan={() => void localActions.handleRunHealthScan()} onDisableConflictMod={(fn) => void localActions.handleDisableConflictMod(fn)} showToast={showToast}
          />
        )}
      </main>
      <ModDetailDrawer
        selectedMod={bridge.selectedMod} selectedLocalMod={bridge.selectedLocalMod} modDetails={bridge.modDetails} detailsLoading={bridge.detailsLoading}
        bridgeConnected={bridgeConnected} subBusy={bridge.subBusy} downloadStatus={drawerDownloadStatus} onClose={bridge.closeModDrawer}
        onInstallMod={handleInstallRepoMod} onOpenExternalUrl={(url) => api.openExternalUrl(url)} onSearchInRepo={repo.handleSearchInRepo}
        onSubscribeMod={bridge.handleSubscribeMod} onUnsubscribeMod={bridge.handleUnsubscribeMod}
        onToggleLocalMod={(m) => void localActions.handleToggleMod(m)} onDeleteLocalMod={(m) => void localActions.handleDeleteMod(m)}
      />
      {showMiniStrip && (
        <DownloadMiniStrip
          summary={downloadManager.summary}
          onPauseAll={() => void downloadManager.pauseAll()}
          onResumeAll={() => void downloadManager.resumeAll()}
          onOpenManager={() => { setActiveTab('local'); downloadManager.setPanelOpen(true); }}
        />
      )}
      <InputContextMenu />
    </div>
  );
}
