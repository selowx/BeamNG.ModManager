import React from 'react';
import { BookmarkCheck, Link2, Search } from 'lucide-react';
import type { BridgeStatus, DownloadProgressPayload, LaunchMode, RepoModItem, RepoWebStatus } from '../types';
import { REPO_CATEGORIES, REPO_SORTS, REPO_SUBSCRIBED_CATEGORY, type RepoViewMode } from '../utils';
import { UI_TEXT } from '../i18n';
import { Card } from './ui/card';
import { RepoModCard } from './RepoModCard';
import { RepoToolbar } from './RepoToolbar';
import { RepoWebStatusBanner } from './RepoWebStatusBanner';

export interface RepoExplorerProps {
  repoItems: RepoModItem[];
  repoLoading: boolean;
  repoSource: string | null;
  repoError: string | null;
  webStatus: RepoWebStatus | null;
  bridgeConnected: boolean;
  bridgeStatus: BridgeStatus | null;
  bridgeBusy: boolean;
  repoCategory: string; setRepoCategory: (c: string) => void;
  repoSort: string; setRepoSort: (s: string) => void;
  repoPage: number; setRepoPage: React.Dispatch<React.SetStateAction<number>>;
  repoTotalPages: number;
  repoPerPage: number; setRepoPerPage: (n: number) => void;
  repoSearchInput: string; setRepoSearchInput: (q: string) => void;
  setRepoQuery: (q: string) => void;
  onRefresh: () => void;
  onOpenDetails: (item: RepoModItem) => void;
  onInstallMod: (resourceId: number, slug: string, title: string) => void;
  onInstallBridge: () => void;
  onReinstallBridge: () => void;
  onUninstallBridge: () => void;
  onToggleBridgeEnabled: () => Promise<BridgeStatus | null> | void;
  gameRunning: boolean;
  launchMode: LaunchMode;
  onLaunchBeamNG: () => void;
  onProbeBridge: () => Promise<BridgeStatus | null>;
  downloads: Record<string, DownloadProgressPayload>;
  viewMode: RepoViewMode;
  onChangeViewMode: (mode: RepoViewMode) => void;
}

const GRID_CLASS: Record<RepoViewMode, string> = {
  list: 'flex flex-col border border-[#323949] rounded-sm bg-[#222733] divide-y divide-[#323949]',
  compact:
    'grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] xl:grid-cols-[repeat(auto-fill,minmax(320px,1fr))] 2xl:grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-4 xl:gap-5',
  wide: 'grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4 xl:gap-5',
};

export function RepoExplorer({
  repoItems, repoLoading, repoSource, repoError, webStatus, bridgeConnected, bridgeStatus, bridgeBusy,
  repoCategory, setRepoCategory, repoSort, setRepoSort, repoPage, setRepoPage, repoTotalPages,
  repoPerPage, setRepoPerPage, repoSearchInput, setRepoSearchInput, setRepoQuery, onRefresh,
  onOpenDetails, onInstallMod, onInstallBridge, onReinstallBridge, onUninstallBridge,
  onToggleBridgeEnabled, gameRunning, launchMode, onLaunchBeamNG, onProbeBridge, downloads,
  viewMode, onChangeViewMode,
}: RepoExplorerProps) {
  const t = UI_TEXT;

  const visibleItems = repoItems.slice(0, repoPerPage);
  const isSubscribedBlocked = repoCategory === REPO_SUBSCRIBED_CATEGORY.id && !bridgeConnected;
  const canShowWebBanner = !isSubscribedBlocked && !repoLoading && !bridgeConnected && repoSource !== 'game_bridge';
  const showWebErrorState =
    canShowWebBanner && (Boolean(repoError) || (repoItems.length === 0 && Boolean(webStatus && webStatus.kind !== 'ok')));
  const showRateLimitStrip =
    canShowWebBanner && Boolean(webStatus?.rateLimited) && repoItems.length > 0;
  const bannerProps = {
    repoError, webStatus, repoLoading, bridgeConnected, bridgeStatus, bridgeBusy,
    gameRunning, launchMode, onRetry: onRefresh, onSwitchToBridge: onRefresh,
    onInstallBridge, onToggleBridgeEnabled, onLaunchBeamNG, onProbeBridge,
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-[#161922]">
      <aside className="w-56 bg-[#1c202a] border-r border-[#323949] flex flex-col gap-3.5 p-3 shrink-0 overflow-y-auto">
        <h2 className="flex items-center gap-2 text-sm uppercase italic font-bold tracking-wide text-white px-1 shrink-0">
          <span className="inline-block w-2 h-4 bg-[#ff6600] -skew-x-[18deg] shrink-0" />
          <span>{t.tabRepo}</span>
        </h2>

        <div className="flex flex-col gap-1 pb-3 border-b border-[#323949]">
          <button
            type="button"
            onClick={() => { setRepoCategory(REPO_SUBSCRIBED_CATEGORY.id); setRepoPage(1); }}
            className={`w-full text-left px-2.5 py-2 rounded-sm text-xs transition-colors cursor-pointer flex flex-col gap-0.5 ${
              repoCategory === REPO_SUBSCRIBED_CATEGORY.id
                ? 'bg-[#ff6600] text-white font-semibold'
                : bridgeConnected
                ? 'text-zinc-200 bg-[#222733] border border-[#323949] hover:border-[#ff6600]'
                : 'text-zinc-400 bg-[#161922] border border-[#323949] hover:text-zinc-200'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <BookmarkCheck className="w-3.5 h-3.5 shrink-0" />
              <span>{t.subscribedFilterLabel}</span>
            </span>
            {!bridgeConnected && (
              <span className={`text-[11px] ${repoCategory === REPO_SUBSCRIBED_CATEGORY.id ? 'text-white/90' : 'text-zinc-400'}`}>
                {t.requiresBridgeHint}
              </span>
            )}
          </button>
        </div>

        <nav className="flex flex-col gap-1" aria-label="Categories">
          <span className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Categories</span>
          {REPO_CATEGORIES.map((cat) => {
            const active = repoCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => { setRepoCategory(cat.id); setRepoPage(1); }}
                className={`w-full text-left px-2.5 py-1.5 rounded-sm text-xs transition-colors cursor-pointer ${
                  active ? 'bg-[#ff6600] text-white font-semibold' : 'text-zinc-400 hover:text-zinc-100 hover:bg-[#282e3c]'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </nav>

        <nav className="flex flex-col gap-1 pt-3 border-t border-[#323949]" aria-label="Sort By">
          <span className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Sort By</span>
          {REPO_SORTS.map((sort) => {
            const active = repoSort === sort.id;
            return (
              <button
                key={sort.id}
                type="button"
                onClick={() => { setRepoSort(sort.id); setRepoPage(1); }}
                className={`w-full text-left px-2.5 py-1.5 rounded-sm text-xs transition-colors cursor-pointer ${
                  active ? 'bg-[#ff6600] text-white font-semibold' : 'text-zinc-400 hover:text-zinc-100 hover:bg-[#282e3c]'
                }`}
              >
                {sort.label}
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden bg-[#161922]">
        <RepoToolbar
          repoSearchInput={repoSearchInput} setRepoSearchInput={setRepoSearchInput} setRepoQuery={setRepoQuery}
          repoLoading={repoLoading} repoSource={repoSource} webStatus={webStatus} bridgeConnected={bridgeConnected}
          bridgeStatus={bridgeStatus} bridgeBusy={bridgeBusy} viewMode={viewMode} onChangeViewMode={onChangeViewMode}
          repoPerPage={repoPerPage} setRepoPerPage={setRepoPerPage} repoPage={repoPage} setRepoPage={setRepoPage}
          repoTotalPages={repoTotalPages} onRefresh={onRefresh} onInstallBridge={onInstallBridge}
          onReinstallBridge={onReinstallBridge} onUninstallBridge={onUninstallBridge}
          onToggleBridgeEnabled={onToggleBridgeEnabled}
        />

        <div className="flex-1 overflow-y-auto p-5 bg-[#161922]">
          {isSubscribedBlocked ? (
            <div className="max-w-lg mx-auto mt-10 rounded-sm bg-[#1c202a] border border-[#323949] p-5 flex items-start gap-3">
              <div className="w-9 h-9 rounded-sm bg-[#222733] border border-[#323949] flex items-center justify-center shrink-0">
                <Link2 className="w-4 h-4 text-[#ff6600]" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-zinc-100">Game Bridge Required</h3>
                <p className="text-xs text-zinc-300 leading-relaxed">{t.connectBridgeSubHint}.</p>
              </div>
            </div>
          ) : repoLoading ? (
            <div className={GRID_CLASS[viewMode]}>
              {Array.from({ length: Math.min(repoPerPage, 12) }).map((_, i) =>
                viewMode === 'list' ? (
                  <div key={i} className="px-4 py-2.5 flex items-center justify-between gap-4 animate-pulse">
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-sm bg-[#282e3c] shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3.5 bg-[#282e3c] rounded-sm w-48 max-w-full" />
                        <div className="h-3 bg-[#282e3c] rounded-sm w-72 max-w-full" />
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="hidden sm:block h-3.5 w-24 bg-[#282e3c] rounded-sm" />
                      <div className="h-7 w-20 bg-[#282e3c] rounded-sm" />
                    </div>
                  </div>
                ) : viewMode === 'wide' ? (
                  <Card
                    key={i}
                    className="flex items-stretch h-36 sm:h-40 animate-pulse bg-[#222733] border-[#323949] overflow-hidden"
                  >
                    <div className="w-44 sm:w-52 shrink-0 bg-[#282e3c]" />
                    <div className="p-3.5 flex flex-col justify-between flex-1">
                      <div className="space-y-2">
                        <div className="h-4 bg-[#282e3c] rounded-sm w-3/4" />
                        <div className="h-3 bg-[#282e3c] rounded-sm w-1/2" />
                        <div className="h-3 bg-[#282e3c] rounded-sm w-full mt-2" />
                      </div>
                      <div className="h-7 bg-[#282e3c] rounded-sm w-full" />
                    </div>
                  </Card>
                ) : (
                  <Card
                    key={i}
                    className="flex flex-col justify-between h-48 p-3.5 animate-pulse bg-[#222733] border-[#323949] overflow-hidden"
                  >
                    <div className="flex gap-3">
                      <div className="w-16 h-16 rounded-sm bg-[#282e3c] shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-[#282e3c] rounded-sm w-3/4" />
                        <div className="h-3 bg-[#282e3c] rounded-sm w-1/2" />
                        <div className="h-3 bg-[#282e3c] rounded-sm w-full" />
                      </div>
                    </div>
                    <div className="h-7 bg-[#282e3c] rounded-sm w-full" />
                  </Card>
                )
              )}
            </div>
          ) : showWebErrorState && repoItems.length === 0 ? (
            <RepoWebStatusBanner {...bannerProps} />
          ) : repoItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-zinc-400">
              <Search className="w-8 h-8 mb-2 text-zinc-500" />
              <p className="text-xs font-medium">{t.noRepoMatch}</p>
            </div>
          ) : (
            <>
              {(showWebErrorState || showRateLimitStrip) && <RepoWebStatusBanner compact {...bannerProps} />}
              <div className={GRID_CLASS[viewMode]}>
                {visibleItems.map((item) => (
                  <RepoModCard
                    key={item.resourceId}
                    item={item}
                    viewMode={viewMode}
                    isDownloading={['downloading', 'resolving', 'verifying', 'queued', 'paused'].includes(downloads[`dl-${item.resourceId}`]?.status || '')}
                    downloadStatus={downloads[`dl-${item.resourceId}`]?.status}
                    onOpenDetails={onOpenDetails}
                    onInstallMod={onInstallMod}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
