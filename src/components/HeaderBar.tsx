import { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  Download,
  FolderOpen,
  HardDrive,
  Layers,
  Loader2,
  PackageCheck,
  Play,
  Settings,
} from 'lucide-react';
import type { BeamNGConfig, LaunchMode } from '../types';
import { cn, type ActiveTab } from '../utils';
import { UI_TEXT } from '../i18n';
import { BeamngEmblem } from './BeamngLogo';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import pkg from '../../package.json';

export interface HeaderBarProps {
  activeTab: ActiveTab;
  setActiveTab: (t: ActiveTab) => void;
  config: BeamNGConfig | null;
  localTotal: number;
  localUpdates: number;
  profileCount?: number;
  hasProfileDrift?: boolean;
  launchMode: LaunchMode;
  launchingGame: boolean;
  onSyncStaged: () => void;
  onOpenModsFolder: () => void;
  onSelectLaunchMode: (mode: LaunchMode) => void;
  onStartBeamNG: () => void;
}

export function HeaderBar({
  activeTab,
  setActiveTab,
  config,
  localTotal,
  localUpdates,
  profileCount = 0,
  hasProfileDrift = false,
  launchMode,
  launchingGame,
  onSyncStaged,
  onOpenModsFolder,
  onSelectLaunchMode,
  onStartBeamNG,
}: HeaderBarProps) {
  const t = UI_TEXT;
  const [launchMenuOpen, setLaunchMenuOpen] = useState(false);
  const launchMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!launchMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (launchMenuRef.current && !launchMenuRef.current.contains(e.target as Node)) {
        setLaunchMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLaunchMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [launchMenuOpen]);

  const handleSelectMode = (mode: LaunchMode) => {
    onSelectLaunchMode(mode);
    setLaunchMenuOpen(false);
  };

  const activeModeLabel = launchMode === 'steam' ? t.launchModeSteam : t.launchModeDirect;
  const activeModeTooltip = launchMode === 'steam' ? t.launchSteamTitle : t.launchDirectTitle;

  return (
    <header className="relative z-30 bg-[#1c202a] border-b border-[#323949] px-3 xl:px-5 h-13 flex items-center justify-between gap-2 shrink-0">
      <div className="flex items-center min-w-0 gap-2.5 xl:gap-4 h-full">
        {/* Brand Block */}
        <div className="flex items-center gap-2.5 shrink-0">
          <BeamngEmblem className="w-7 h-7 shrink-0" />
          <div className="flex items-center gap-2 text-sm whitespace-nowrap">
            <span className="tracking-wide">
              <span className="text-white italic font-bold">BeamNG</span>
              <span className="hidden xl:inline text-[#ff6600] italic font-bold">.ModManager</span>
            </span>
            <Badge variant="outline" className="hidden 2xl:inline-flex font-mono tabular-nums text-[11px] ml-1 shrink-0">
              v{pkg.version}
            </Badge>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center h-full shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('local')}
            className={cn(
              'h-full px-2.5 xl:px-3.5 flex items-center gap-1.5 xl:gap-2 text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors cursor-pointer whitespace-nowrap shrink-0',
              activeTab === 'local'
                ? 'border-b-[#ff6600] bg-[#282e3c] text-white'
                : 'border-b-transparent text-zinc-400 hover:text-zinc-200 hover:bg-[#222733]'
            )}
          >
            <HardDrive className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden xl:inline">{t.tabLocal}</span><span className="xl:hidden">Installed</span>
            <span className="font-mono tabular-nums text-xs opacity-75">({localTotal})</span>
            {localUpdates > 0 && (
              <span className="px-1.5 py-0.2 bg-amber-400 text-black rounded-sm font-mono tabular-nums text-[11px] font-bold">
                {localUpdates}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('profiles')}
            className={cn(
              'h-full px-2.5 xl:px-4 flex items-center gap-1.5 xl:gap-2 text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors cursor-pointer whitespace-nowrap shrink-0',
              activeTab === 'profiles'
                ? 'border-b-[#ff6600] bg-[#282e3c] text-white'
                : 'border-b-transparent text-zinc-400 hover:text-zinc-200 hover:bg-[#222733]'
            )}
          >
            <Layers className="w-3.5 h-3.5 shrink-0" />
            <span>{t.tabProfiles}</span>
            {profileCount > 0 && <span className="font-mono tabular-nums text-xs opacity-75">({profileCount})</span>}
            {hasProfileDrift && <span className="w-1.5 h-1.5 rounded-full bg-[#ff6600] shrink-0" title="Active profile has unsaved changes" />}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('repo')}
            className={cn(
              'h-full px-2.5 xl:px-3.5 flex items-center gap-1.5 xl:gap-2 text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors cursor-pointer whitespace-nowrap shrink-0',
              activeTab === 'repo'
                ? 'border-b-[#ff6600] bg-[#282e3c] text-white'
                : 'border-b-transparent text-zinc-400 hover:text-zinc-200 hover:bg-[#222733]'
            )}
          >
            <Download className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden xl:inline">{t.tabRepo}</span><span className="xl:hidden">Repo</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={cn(
              'h-full px-2.5 xl:px-3.5 flex items-center gap-1.5 xl:gap-2 text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors cursor-pointer whitespace-nowrap shrink-0',
              activeTab === 'settings'
                ? 'border-b-[#ff6600] bg-[#282e3c] text-white'
                : 'border-b-transparent text-zinc-400 hover:text-zinc-200 hover:bg-[#222733]'
            )}
          >
            <Settings className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden xl:inline">{t.tabSettings}</span><span className="xl:hidden">Settings</span>
          </button>
        </nav>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-1.5 xl:gap-2.5 shrink-0">
        {config && config.stagedCount > 0 && (
          <Button variant="amber" size="default" onClick={onSyncStaged} className="whitespace-nowrap shrink-0">
            <PackageCheck className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden xl:inline">{t.syncStaged}</span><span className="xl:hidden">Staged</span>
            <span className="font-mono tabular-nums">({config.stagedCount})</span>
          </Button>
        )}

        <Badge
          variant={config?.gameRunning ? 'warning' : 'outline'}
          className={cn(
            'h-8 px-2.5 text-xs whitespace-nowrap shrink-0',
            !config?.gameRunning && 'bg-[#161922] border-[#323949] text-zinc-400'
          )}
          title={`${config?.gameRunning ? t.gameRunningTitle : t.gameClosedTitle}${config?.version ? ` (BeamNG v${config.version})` : ''}`}
        >
          <span
            className={cn(
              'w-1.5 h-1.5 rounded-full shrink-0',
              config?.gameRunning ? 'bg-amber-400' : 'bg-zinc-500'
            )}
          />
          <span>{config?.gameRunning ? t.gameRunningBadge : t.gameClosedBadge}</span>
        </Badge>

        <Button
          variant="secondary"
          size="default"
          onClick={onOpenModsFolder}
          title={t.openFolderTitle}
          className="whitespace-nowrap shrink-0"
        >
          <FolderOpen className="w-3.5 h-3.5 text-[#ff6600] shrink-0" />
          <span className="hidden xl:inline">{t.openFolder}</span>
        </Button>

        {!config?.gameRunning && (
          <div ref={launchMenuRef} className="relative inline-flex items-center shrink-0">
            <div className="inline-flex h-8 rounded-sm border border-[#ff6600] bg-[#ff6600] overflow-hidden shrink-0">
              <button
                type="button"
                disabled={launchingGame}
                onClick={() => {
                  setLaunchMenuOpen(false);
                  onStartBeamNG();
                }}
                title={activeModeTooltip}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 text-xs font-semibold font-sans text-white leading-none transition-colors outline-none focus-visible:ring-1 focus-visible:ring-white whitespace-nowrap shrink-0',
                  launchingGame ? 'opacity-80 cursor-not-allowed' : 'hover:bg-[#e65c00] cursor-pointer'
                )}
              >
                {launchingGame ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current shrink-0" />
                )}
                <span className="inline-flex items-baseline gap-1 leading-none">
                  <span>{launchingGame ? t.launchingGameBtn : t.startGame}</span>
                  <span className="hidden xl:inline text-[11px] font-sans font-normal leading-none opacity-90">({activeModeLabel})</span>
                </span>
              </button>
              <button
                type="button"
                disabled={launchingGame}
                aria-label="Choose launch mode"
                aria-expanded={launchMenuOpen}
                aria-haspopup="menu"
                onClick={() => setLaunchMenuOpen((v) => !v)}
                className={cn(
                  'inline-flex items-center justify-center w-7 border-l border-black/20 text-white transition-colors outline-none focus-visible:ring-1 focus-visible:ring-white',
                  launchingGame ? 'opacity-80 cursor-not-allowed' : 'hover:bg-[#e65c00] cursor-pointer'
                )}
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>

            {launchMenuOpen && (
              <div
                role="menu"
                aria-label="BeamNG Launch Mode"
                className="absolute right-0 top-full mt-1.5 w-64 bg-[#1c202a] border border-[#323949] rounded-sm p-1 z-50 space-y-1"
              >
                {([
                  { mode: 'steam' as const, title: t.launchSteamTitle, desc: t.launchSteamDesc },
                  { mode: 'direct' as const, title: t.launchDirectTitle, desc: t.launchDirectDesc },
                ]).map((opt) => {
                  const selected = launchMode === opt.mode;
                  return (
                    <button
                      key={opt.mode}
                      type="button"
                      role="menuitemradio"
                      aria-checked={selected}
                      onClick={() => handleSelectMode(opt.mode)}
                      className={cn(
                        'w-full text-left px-2.5 py-2 rounded-sm flex items-start justify-between gap-2 transition-colors cursor-pointer',
                        selected
                          ? 'bg-[#282e3c] border-l-2 border-l-[#ff6600] text-white'
                          : 'text-zinc-300 hover:bg-[#222733] hover:text-white'
                      )}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold leading-snug">{opt.title}</div>
                        <div className="text-[11px] text-zinc-400 leading-snug">{opt.desc}</div>
                      </div>
                      {selected && <Check className="w-3.5 h-3.5 text-[#ff6600] shrink-0 mt-0.5" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
