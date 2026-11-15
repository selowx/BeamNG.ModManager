import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Lock, RefreshCw, Search, X } from 'lucide-react';
import type { LocalMod } from '../types';
import type { DownloadManagerController } from '../hooks/useDownloadManager';
import { formatBytes, matchesCategory, type LocalFilter, type LocalViewMode } from '../utils';
import { LOCAL_CATEGORIES, UI_TEXT } from '../i18n';
import { LOCAL_VIEW_OPTIONS } from '../constants/viewModes';
import { Button } from './ui/button';
import { SelectDropdown } from './ui/select';
import { LocalModCard } from './LocalModCard';
import { LocalModRow } from './LocalModRow';
import { DownloadDockWidget } from './DownloadDockWidget';
import { DownloadManagerPanel } from './DownloadManagerPanel';

export interface LocalModsViewProps {
  localMods: LocalMod[];
  filteredLocalMods: LocalMod[];
  localStats: { total: number; active: number; disabled: number; pinned: number; updates: number; totalBytes: number };
  localFilter: LocalFilter;
  setLocalFilter: (f: LocalFilter) => void;
  localCategory: string;
  setLocalCategory: (c: string) => void;
  localSearch: string;
  setLocalSearch: (s: string) => void;
  localLoading: boolean;
  checkingUpdates: boolean;
  busyModIds: Record<string, boolean>;
  onCheckUpdates: () => void;
  onUpdateAll?: () => void;
  onBulkToggle: (mods: LocalMod[], active: boolean) => void;
  onToggleMod: (mod: LocalMod) => void;
  onTogglePin: (mod: LocalMod) => void;
  onDeleteMod: (mod: LocalMod) => void;
  onInstallRepoMod: (resourceId: number, slug: string, title: string) => void;
  onOpenModPage: (mod: LocalMod) => void;
  downloadManager: DownloadManagerController;
  viewMode: LocalViewMode;
  onChangeViewMode: (mode: LocalViewMode) => void;
}

const navItemClass = (active: boolean) =>
  `w-full px-2.5 py-1.5 rounded-sm text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
    active ? 'bg-[#ff6600] text-white font-semibold' : 'text-zinc-400 hover:text-zinc-100 hover:bg-[#282e3c]'
  }`;

export function LocalModsView(props: LocalModsViewProps) {
  const {
    localMods, filteredLocalMods, localStats, localFilter, setLocalFilter, localCategory, setLocalCategory,
    localSearch, setLocalSearch, localLoading, checkingUpdates, busyModIds, onCheckUpdates, onUpdateAll, onBulkToggle,
    onToggleMod, onTogglePin, onDeleteMod, onInstallRepoMod, onOpenModPage, downloadManager,
    viewMode, onChangeViewMode,
  } = props;
  const t = UI_TEXT;

  const [perPage, setPerPage] = useState<number>(() => {
    const saved = Number(localStorage.getItem('modmanager_local_per_page'));
    return [12, 24, 50, 0].includes(saved) ? saved : 24;
  });
  const [page, setPage] = useState<number>(1);

  useEffect(() => { setPage(1); }, [localFilter, localCategory, localSearch]);

  const totalPages = perPage === 0 ? 1 : Math.max(1, Math.ceil(filteredLocalMods.length / perPage));
  const safePage = Math.min(page, totalPages);
  const pagedMods = useMemo(
    () => (perPage === 0 ? filteredLocalMods : filteredLocalMods.slice((safePage - 1) * perPage, safePage * perPage)),
    [filteredLocalMods, perPage, safePage]
  );

  const handleSetPerPage = (val: number) => {
    setPerPage(val);
    localStorage.setItem('modmanager_local_per_page', String(val));
    setPage(1);
  };

  const modItemProps = (mod: LocalMod) => ({
    mod,
    busy: !!busyModIds[mod.id],
    onToggle: () => onToggleMod(mod),
    onPin: () => onTogglePin(mod),
    onDelete: () => onDeleteMod(mod),
    onUpdate: () => mod.resourceId && onInstallRepoMod(mod.resourceId, mod.latestSlug || `resources/${mod.resourceId}/`, mod.title),
    onOpenModPage: () => onOpenModPage(mod),
  });

  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const cat of LOCAL_CATEGORIES) {
      map[cat.id] = localMods.filter((m) => matchesCategory(m.category, cat.id)).length;
    }
    return map;
  }, [localMods]);

  const statusFilters = [
    { id: 'all' as LocalFilter, label: t.filterAll, count: localStats.total },
    { id: 'active' as LocalFilter, label: t.filterActive, count: localStats.active },
    { id: 'disabled' as LocalFilter, label: t.filterDisabled, count: localStats.disabled },
    { id: 'pinned' as LocalFilter, label: t.filterPinned, count: localStats.pinned, icon: <Lock className="w-3 h-3" /> },
    ...(localStats.updates > 0
      ? [{ id: 'updates' as LocalFilter, label: t.filterUpdates, count: localStats.updates, icon: <RefreshCw className="w-3 h-3" /> }]
      : []),
  ];

  return (
    <div className="relative flex-1 flex overflow-hidden bg-[#161922]">
      {/* Left Sidebar */}
      <aside className="w-56 bg-[#1c202a] border-r border-[#323949] flex flex-col gap-3.5 p-3 shrink-0 overflow-y-auto">
        <h2 className="flex items-center gap-2 text-sm uppercase italic font-bold tracking-wide text-white px-1 shrink-0">
          <span className="inline-block w-2 h-4 bg-[#ff6600] -skew-x-[18deg] shrink-0" />
          <span>{t.tabLocal}</span>
        </h2>

        <div className="space-y-1">
          <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Status</div>
          {statusFilters.map((f) => {
            const active = localFilter === f.id;
            return (
              <button key={f.id} type="button" onClick={() => setLocalFilter(f.id)} className={navItemClass(active)}>
                <span className="flex items-center gap-1.5 truncate">
                  {f.icon}
                  <span className="truncate">{f.label}</span>
                </span>
                <span className={`font-mono tabular-nums text-[11px] ${active ? 'text-white/90' : 'text-zinc-400'}`}>
                  {f.count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="space-y-1">
          <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Categories</div>
          {LOCAL_CATEGORIES.map((cat) => {
            const active = localCategory === cat.id;
            return (
              <button key={cat.id} type="button" onClick={() => setLocalCategory(cat.id)} className={navItemClass(active)}>
                <span className="truncate">{cat.label}</span>
                <span className={`font-mono tabular-nums text-[11px] ${active ? 'text-white/90' : 'text-zinc-400'}`}>
                  {categoryCounts[cat.id] ?? 0}
                </span>
              </button>
            );
          })}
        </div>

        <DownloadDockWidget
          summary={downloadManager.summary}
          panelOpen={downloadManager.panelOpen}
          onTogglePanel={() => downloadManager.setPanelOpen((v) => !v)}
          onPauseAll={() => void downloadManager.pauseAll()}
          onResumeAll={() => void downloadManager.resumeAll()}
        />
      </aside>

      {/* Right Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-[#161922]">
        <div className="h-12 px-3 xl:px-5 bg-[#1c202a] border-b border-[#323949] flex items-center justify-between gap-2 xl:gap-3 shrink-0">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex items-center flex-1 min-w-[160px] max-w-xs xl:max-w-sm h-8 rounded-sm border border-[#323949] bg-[#161922] focus-within:border-[#ff6600] focus-within:ring-1 focus-within:ring-[#ff6600]/40 overflow-hidden">
              <Search className="w-3.5 h-3.5 text-zinc-400 ml-2.5 shrink-0 pointer-events-none" />
              <input
                type="text"
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                placeholder={t.localSearchPlaceholder}
                className="flex-1 min-w-0 h-full bg-transparent px-2.5 text-xs text-zinc-100 placeholder:text-zinc-400 outline-none"
              />
              {localSearch && (
                <button
                  type="button" onClick={() => setLocalSearch('')}
                  className="w-8 h-full shrink-0 flex items-center justify-center text-zinc-400 hover:text-zinc-100 cursor-pointer"
                  aria-label={t.closeTitle} title={t.closeTitle}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <span className="hidden xl:inline text-xs font-mono tabular-nums text-zinc-400 shrink-0 whitespace-nowrap">
              {filteredLocalMods.length} / {localStats.total} · {formatBytes(localStats.totalBytes)}
            </span>
          </div>

          <div className="flex items-center gap-1.5 xl:gap-2 shrink-0">
            {localStats.updates > 0 && onUpdateAll && (
              <Button variant="default" size="default" onClick={onUpdateAll} className="font-mono tabular-nums">
                <Download className="w-3.5 h-3.5" />
                <span>{t.updateAllBtn} ({localStats.updates})</span>
              </Button>
            )}
            <Button variant="secondary" size="default" onClick={onCheckUpdates} disabled={checkingUpdates} title={t.checkUpdatesBtn}>
              <RefreshCw className={`w-3.5 h-3.5 ${checkingUpdates ? 'animate-spin text-[#ff6600]' : ''}`} />
              <span className="hidden xl:inline">{t.checkUpdatesBtn}</span>
            </Button>
            <Button variant="outline" size="default" onClick={() => onBulkToggle(filteredLocalMods, true)} disabled={localLoading}>
              {t.enableAllBtn}
            </Button>
            <Button
              variant="outline" size="default" onClick={() => onBulkToggle(filteredLocalMods, false)}
              disabled={localLoading} title={t.disableUnlockedTitle}
            >
              <span className="hidden 2xl:inline">{t.disableUnlockedBtn}</span><span className="2xl:hidden">Disable</span>
            </Button>

            <div className="h-8 p-0.5 bg-[#161922] border border-[#323949] rounded-sm inline-flex items-center gap-0.5" role="group" aria-label="View mode">
              {LOCAL_VIEW_OPTIONS.map(({ id, label, icon: Icon }) => {
                const active = viewMode === id;
                return (
                  <button
                    key={id} type="button" onClick={() => onChangeViewMode(id)}
                    aria-pressed={active} aria-label={label} title={label}
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
                value={perPage}
                onChange={(v) => handleSetPerPage(Number(v))}
                options={[{ value: 12, label: '12' }, { value: 24, label: '24' }, { value: 50, label: '50' }, { value: 0, label: 'All' }]}
                align="right"
                size="xs"
                title={t.perPageLabel}
              />
            </div>

            {perPage !== 0 && (
              <div className="flex items-center gap-1">
                <Button
                  variant="outline" size="icon" disabled={safePage <= 1}
                  className="h-8 w-8 border-[#3b4356] bg-[#282e3c] text-zinc-200 hover:border-[#ff6600] hover:text-[#ff6600] hover:bg-[#282e3c]"
                  onClick={() => setPage((p) => Math.max(1, p - 1))} title={t.prevPageTitle}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="h-8 min-w-[3.25rem] flex items-center justify-center px-2 rounded-sm bg-[#161922] border border-[#323949] font-mono tabular-nums text-xs text-zinc-200">
                  {safePage} / {totalPages}
                </span>
                <Button
                  variant="outline" size="icon" disabled={safePage >= totalPages}
                  className="h-8 w-8 border-[#3b4356] bg-[#282e3c] text-zinc-200 hover:border-[#ff6600] hover:text-[#ff6600] hover:bg-[#282e3c]"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))} title={t.nextPageTitle}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 bg-[#161922]">
          {filteredLocalMods.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-zinc-400">
              <Search className="w-8 h-8 mb-2 text-zinc-500" />
              <p className="text-xs font-medium">{t.noLocalMatch}</p>
            </div>
          ) : viewMode === 'cards' ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(285px,1fr))] xl:grid-cols-[repeat(auto-fill,minmax(320px,1fr))] 2xl:grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-4">
              {pagedMods.map((mod) => <LocalModCard key={mod.id} {...modItemProps(mod)} />)}
            </div>
          ) : (
            <div className="divide-y divide-[#323949] border border-[#323949] rounded-sm bg-[#222733] overflow-hidden">
              {pagedMods.map((mod) => <LocalModRow key={mod.id} {...modItemProps(mod)} viewMode={viewMode} />)}
            </div>
          )}
        </div>
      </div>

      {downloadManager.panelOpen && (
        <DownloadManagerPanel
          manager={downloadManager}
          onClose={() => downloadManager.setPanelOpen(false)}
        />
      )}
    </div>
  );
}
