import React from 'react';
import {
  ChevronLeft, ChevronRight, RefreshCw, Search, X,
} from 'lucide-react';
import type { BridgeStatus, RepoWebStatus } from '../types';
import { UI_TEXT } from '../i18n';
import { REPO_VIEW_OPTIONS } from '../constants/viewModes';
import type { RepoViewMode } from '../utils';
import { Button } from './ui/button';
import { SelectDropdown } from './ui/select';
import { BridgeControlPopover } from './BridgeControlPopover';

export interface RepoToolbarProps {
  repoSearchInput: string;
  setRepoSearchInput: (q: string) => void;
  setRepoQuery: (q: string) => void;
  repoLoading: boolean;
  repoSource: string | null;
  webStatus: RepoWebStatus | null;
  bridgeConnected: boolean;
  bridgeStatus: BridgeStatus | null;
  bridgeBusy: boolean;
  viewMode: RepoViewMode;
  onChangeViewMode: (mode: RepoViewMode) => void;
  repoPerPage: number;
  setRepoPerPage: (n: number) => void;
  repoPage: number;
  setRepoPage: React.Dispatch<React.SetStateAction<number>>;
  repoTotalPages: number;
  onRefresh: () => void;
  onInstallBridge: () => void;
  onReinstallBridge: () => void;
  onUninstallBridge: () => void;
  onToggleBridgeEnabled: () => Promise<BridgeStatus | null> | void;
}

export function RepoToolbar({
  repoSearchInput, setRepoSearchInput, setRepoQuery, repoLoading, repoSource, webStatus,
  bridgeConnected, bridgeStatus, bridgeBusy, viewMode, onChangeViewMode, repoPerPage,
  setRepoPerPage, repoPage, setRepoPage, repoTotalPages, onRefresh, onInstallBridge,
  onReinstallBridge, onUninstallBridge, onToggleBridgeEnabled,
}: RepoToolbarProps) {
  const t = UI_TEXT;

  return (
    <div className="h-12 px-3 xl:px-5 bg-[#1c202a] border-b border-[#323949] flex items-center justify-between gap-2 xl:gap-3 shrink-0">
      <form
        onSubmit={(e) => { e.preventDefault(); setRepoPage(1); setRepoQuery(repoSearchInput); }}
        className="flex items-center flex-1 min-w-[170px] max-w-xs xl:max-w-md h-8 rounded-sm border border-[#323949] bg-[#161922] focus-within:border-[#ff6600] focus-within:ring-1 focus-within:ring-[#ff6600]/40 overflow-hidden"
      >
        <input
          type="text"
          value={repoSearchInput}
          onChange={(e) => { setRepoSearchInput(e.target.value); if (e.target.value === '') setRepoQuery(''); }}
          placeholder={t.repoSearchPlaceholder}
          className="flex-1 min-w-0 h-full bg-transparent pl-3 pr-2 text-xs text-zinc-100 placeholder:text-zinc-400 outline-none"
        />
        {repoSearchInput && (
          <button
            type="button"
            onClick={() => { setRepoSearchInput(''); setRepoQuery(''); }}
            className="w-8 h-full shrink-0 flex items-center justify-center text-zinc-400 hover:text-zinc-100 cursor-pointer"
            aria-label={t.closeTitle}
            title={t.closeTitle}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <span className="w-px h-4 bg-[#323949] shrink-0" aria-hidden="true" />
        <button
          type="submit"
          className="w-9 h-full shrink-0 flex items-center justify-center bg-[#ff6600] hover:bg-[#e65c00] text-white transition-colors cursor-pointer"
          title={t.searchBtn}
          aria-label={t.searchBtn}
        >
          <Search className="w-3.5 h-3.5" />
        </button>
      </form>

      <div className="flex items-center gap-2 shrink-0">
        {!bridgeConnected && repoSource !== 'game_bridge' && webStatus?.rateLimited && (
          <span className="h-8 px-2.5 rounded-sm border border-amber-500/40 bg-amber-950/50 text-amber-300 text-xs font-mono tabular-nums inline-flex items-center whitespace-nowrap">
            Rate Limited ({webStatus.cooldownRemainingSecs}s)
          </span>
        )}
        <BridgeControlPopover
          repoSource={repoSource} bridgeStatus={bridgeStatus} bridgeBusy={bridgeBusy}
          onInstallBridge={onInstallBridge} onReinstallBridge={onReinstallBridge}
          onUninstallBridge={onUninstallBridge} onToggleBridgeEnabled={onToggleBridgeEnabled}
        />
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={onRefresh} disabled={repoLoading} title={t.refreshTitle}>
          <RefreshCw className={`w-3.5 h-3.5 ${repoLoading ? 'animate-spin text-[#ff6600]' : ''}`} />
        </Button>

        <div className="h-8 p-0.5 bg-[#161922] border border-[#323949] rounded-sm inline-flex items-center gap-0.5" role="group" aria-label="Repo view mode">
          {REPO_VIEW_OPTIONS.map(({ id, label, icon: Icon }) => {
            const active = viewMode === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onChangeViewMode(id)}
                aria-pressed={active}
                aria-label={label}
                title={label}
                className={`h-[26px] w-7 rounded-sm flex items-center justify-center transition-colors cursor-pointer ${
                  active ? 'bg-[#ff6600] text-white' : 'text-zinc-400 hover:text-zinc-100 hover:bg-[#282e3c]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5" title={t.perPageLabel}>
          <span className="hidden xl:inline text-[11px] text-zinc-400">{t.perPageLabel}:</span>
          <SelectDropdown
            value={repoPerPage}
            onChange={(v) => setRepoPerPage(Number(v))}
            options={[{ value: 8, label: '8' }, { value: 12, label: '12' }, { value: 20, label: '20' }]}
            align="right"
            size="xs"
            title={t.perPageLabel}
          />
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline" size="icon"
            className="h-8 w-8 border-[#3b4356] bg-[#282e3c] text-zinc-200 hover:border-[#ff6600] hover:text-[#ff6600] hover:bg-[#282e3c]"
            onClick={() => setRepoPage((p) => Math.max(1, p - 1))}
            disabled={repoPage <= 1 || repoLoading} title={t.prevPageTitle}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="h-8 min-w-[3.5rem] flex items-center justify-center px-2 rounded-sm bg-[#161922] border border-[#323949] text-xs font-mono tabular-nums text-zinc-200">
            {repoPage} / {repoTotalPages}
          </span>
          <Button
            variant="outline" size="icon"
            className="h-8 w-8 border-[#3b4356] bg-[#282e3c] text-zinc-200 hover:border-[#ff6600] hover:text-[#ff6600] hover:bg-[#282e3c]"
            onClick={() => setRepoPage((p) => Math.min(repoTotalPages, p + 1))}
            disabled={repoPage >= repoTotalPages || repoLoading} title={t.nextPageTitle}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
