import { useCallback, useEffect, useState } from 'react';
import {
  Database,
  FileWarning,
  HardDrive,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { api } from '../api';
import type { CacheSummary, LaunchMode } from '../types';
import { cn, formatBytes, type LocalViewMode, type RepoViewMode } from '../utils';
import { UI_TEXT } from '../i18n';
import { LOCAL_VIEW_OPTIONS, REPO_VIEW_OPTIONS } from '../constants/viewModes';
import { Button } from './ui/button';
import { Card } from './ui/card';

export interface SettingsCacheSectionProps {
  launchMode: LaunchMode;
  onSelectLaunchMode: (mode: LaunchMode) => void;
  repoViewMode: RepoViewMode;
  onChangeRepoViewMode: (mode: RepoViewMode) => void;
  localViewMode: LocalViewMode;
  onChangeLocalViewMode: (mode: LocalViewMode) => void;
  onRefreshLocal: () => Promise<unknown> | void;
  showToast: (text: string, type?: 'info' | 'success' | 'error') => void;
}

type CacheScope = 'repo' | 'local_metadata' | 'staging_parts' | 'all';

export function SettingsCacheSection({
  launchMode,
  onSelectLaunchMode,
  repoViewMode,
  onChangeRepoViewMode,
  localViewMode,
  onChangeLocalViewMode,
  onRefreshLocal,
  showToast,
}: SettingsCacheSectionProps) {
  const t = UI_TEXT;
  const [summary, setSummary] = useState<CacheSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [clearingScope, setClearingScope] = useState<CacheScope | null>(null);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      setSummary(await api.getCacheSummary());
    } catch (err) {
      showToast(`Failed to read cache summary: ${String(err)}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const handleClear = async (scope: CacheScope, label: string) => {
    setClearingScope(scope);
    try {
      const res = await api.clearAppCache(scope);
      if (scope === 'local_metadata' || scope === 'all') {
        await onRefreshLocal();
      }
      setSummary(await api.getCacheSummary());
      const freedText = res.freedBytes > 0 ? ` (${formatBytes(res.freedBytes)} freed)` : '';
      showToast(`Cleared ${label}: ${res.clearedEntries} entries${freedText}.`, 'success');
    } catch (err) {
      showToast(`Failed to clear ${label}: ${String(err)}`, 'error');
    } finally {
      setClearingScope(null);
    }
  };

  const renderSegBtn = (active: boolean, onClick: () => void, label: string, Icon?: typeof HardDrive) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'h-8 px-3 rounded-sm text-xs inline-flex items-center gap-1.5 border transition-colors cursor-pointer whitespace-nowrap shrink-0',
        active
          ? 'bg-[#ff6600] border-[#ff6600] text-white font-semibold'
          : 'bg-[#1c202a] border-[#323949] text-zinc-300 hover:bg-[#282e3c] hover:text-white'
      )}
    >
      {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
      <span>{label}</span>
    </button>
  );

  const repoCacheDetail = summary
    ? `${summary.catalogExists ? formatBytes(summary.catalogBytes) : '0 B'} catalog · ${summary.memoryRepoEntries} repo + ${summary.memoryUpdateEntries} update entries`
    : 'Loading...';
  const localMetaDetail = summary ? `${summary.localMetadataEntries} cached mod entries` : 'Loading...';
  const stagingDetail = summary
    ? `${summary.stagingPartFiles} incomplete .part file(s) · ${formatBytes(summary.stagingPartBytes)}`
    : 'Loading...';

  const cacheRows: { scope: Exclude<CacheScope, 'all'>; title: string; detail: string; Icon: typeof Database }[] = [
    { scope: 'repo', title: t.settingsCacheRepoTitle, detail: repoCacheDetail, Icon: Database },
    { scope: 'local_metadata', title: t.settingsCacheLocalTitle, detail: localMetaDetail, Icon: HardDrive },
    { scope: 'staging_parts', title: t.settingsCacheStagingTitle, detail: stagingDetail, Icon: FileWarning },
  ];

  return (
    <div className="w-full max-w-6xl space-y-5">
      <Card className="p-4 bg-[#222733] border-[#323949] space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">{t.settingsPrefsTitle}</h3>
        <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-zinc-300">{t.settingsLaunchModeLabel}</div>
            <div className="flex items-center gap-1.5">
              {renderSegBtn(launchMode === 'steam', () => onSelectLaunchMode('steam'), t.launchModeSteam)}
              {renderSegBtn(launchMode === 'direct', () => onSelectLaunchMode('direct'), t.launchModeDirect)}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-medium text-zinc-300">{t.settingsLocalViewLabel}</div>
            <div className="flex items-center gap-1.5">
              {LOCAL_VIEW_OPTIONS.map(({ id, label, icon }) =>
                renderSegBtn(localViewMode === id, () => onChangeLocalViewMode(id), label, icon)
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-medium text-zinc-300">{t.settingsRepoViewLabel}</div>
            <div className="flex items-center gap-1.5">
              {REPO_VIEW_OPTIONS.map(({ id, label, icon }) =>
                renderSegBtn(repoViewMode === id, () => onChangeRepoViewMode(id), label, icon)
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-4 bg-[#222733] border-[#323949] space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">{t.settingsCacheTitle}</h3>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void loadSummary()} disabled={loading || clearingScope !== null}>
              <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
              <span>{t.settingsRefreshCacheBtn}</span>
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => void handleClear('all', 'all caches')}
              disabled={loading || clearingScope !== null}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{clearingScope === 'all' ? 'Clearing...' : t.settingsClearAllBtn}</span>
            </Button>
          </div>
        </div>

        <div className="flex items-start gap-2.5 p-3 rounded-sm bg-[#1c202a] border border-emerald-800/50 text-xs text-emerald-200">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <span>{t.settingsCacheSafetyNote}</span>
        </div>

        <div className="divide-y divide-[#323949] border border-[#323949] rounded-sm bg-[#1c202a]">
          {cacheRows.map(({ scope, title, detail, Icon }) => (
            <div key={scope} className="p-3.5 flex items-center justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-8 h-8 rounded-sm bg-[#222733] border border-[#323949] flex items-center justify-center shrink-0 text-zinc-300">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0 space-y-0.5">
                  <div className="text-xs font-semibold text-zinc-100">{title}</div>
                  <div className="text-xs font-mono tabular-nums text-zinc-400">{detail}</div>
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void handleClear(scope, title)}
                disabled={loading || clearingScope !== null}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{clearingScope === scope ? 'Clearing...' : t.settingsClearBtn}</span>
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
