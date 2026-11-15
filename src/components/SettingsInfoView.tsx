import { useState } from 'react';
import { History, Info, ShieldAlert, SlidersHorizontal } from 'lucide-react';
import type { BeamNGConfig, BridgeStatus, LaunchMode, ScanReport } from '../types';
import type { LocalViewMode, RepoViewMode } from '../utils';
import { UI_TEXT } from '../i18n';
import { SettingsCacheSection } from './SettingsCacheSection';
import { HealthScannerView } from './HealthScannerView';
import { ChangelogSection } from './ChangelogSection';
import { CreditsSection } from './CreditsSection';

type SettingsSectionId = 'cache' | 'health' | 'changelog' | 'credits';

export interface SettingsInfoViewProps {
  config: BeamNGConfig | null;
  bridgeStatus: BridgeStatus | null;
  launchMode: LaunchMode;
  onSelectLaunchMode: (mode: LaunchMode) => void;
  repoViewMode: RepoViewMode;
  onChangeRepoViewMode: (mode: RepoViewMode) => void;
  localViewMode: LocalViewMode;
  onChangeLocalViewMode: (mode: LocalViewMode) => void;
  onRefreshLocal: () => Promise<unknown> | void;
  scanReport: ScanReport | null;
  scanning: boolean;
  onRunHealthScan: () => void;
  onDisableConflictMod?: (filename: string) => void;
  showToast: (text: string, type?: 'info' | 'success' | 'error') => void;
}

export function SettingsInfoView({
  config,
  bridgeStatus,
  launchMode,
  onSelectLaunchMode,
  repoViewMode,
  onChangeRepoViewMode,
  localViewMode,
  onChangeLocalViewMode,
  onRefreshLocal,
  scanReport,
  scanning,
  onRunHealthScan,
  onDisableConflictMod,
  showToast,
}: SettingsInfoViewProps) {
  const t = UI_TEXT;
  const [section, setSection] = useState<SettingsSectionId>('cache');

  const navItems: { id: SettingsSectionId; label: string; Icon: typeof SlidersHorizontal }[] = [
    { id: 'cache', label: t.settingsSectionCache, Icon: SlidersHorizontal },
    { id: 'health', label: t.tabHealth, Icon: ShieldAlert },
    { id: 'changelog', label: t.settingsSectionChangelog, Icon: History },
    { id: 'credits', label: t.settingsSectionCredits, Icon: Info },
  ];

  const healthIssueCount = scanReport
    ? scanReport.corruptZips.length + scanReport.duplicateMods.length + scanReport.conflicts.length
    : 0;

  const activeTitle = navItems.find((item) => item.id === section)?.label ?? t.tabSettings;

  const handleSelectSection = (id: SettingsSectionId) => {
    setSection(id);
    if (id === 'health' && !scanReport && !scanning) {
      onRunHealthScan();
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-[#161922]">
      <aside className="w-56 bg-[#1c202a] border-r border-[#323949] flex flex-col gap-3.5 p-3 shrink-0 overflow-y-auto">
        <h2 className="flex items-center gap-2 text-sm uppercase italic font-bold tracking-wide text-white px-1 shrink-0">
          <span className="inline-block w-2 h-4 bg-[#ff6600] -skew-x-[18deg] shrink-0" />
          <span>{t.tabSettings}</span>
        </h2>

        <nav className="space-y-1" aria-label={t.tabSettings}>
          <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            Sections
          </div>
          {navItems.map(({ id, label, Icon }) => {
            const active = section === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleSelectSection(id)}
                className={`w-full px-2.5 py-1.5 rounded-sm text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#ff6600] text-white font-semibold'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-[#282e3c]'
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{label}</span>
                </span>
                {id === 'health' && healthIssueCount > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-sm font-mono tabular-nums text-[11px] font-bold shrink-0 ${
                      active ? 'bg-black/25 text-white' : 'bg-amber-500/20 text-amber-300'
                    }`}
                  >
                    {healthIssueCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      {section === 'health' ? (
        <HealthScannerView
          embedded
          scanReport={scanReport}
          scanning={scanning}
          onRunHealthScan={onRunHealthScan}
          onDisableModByFilename={onDisableConflictMod}
        />
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden bg-[#161922]">
          <div className="h-12 px-5 bg-[#1c202a] border-b border-[#323949] flex items-center justify-between gap-3 shrink-0">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">{activeTitle}</h3>
          </div>

          <div className="flex-1 overflow-y-auto p-5 bg-[#161922]">
            {section === 'cache' && (
              <SettingsCacheSection
                launchMode={launchMode}
                onSelectLaunchMode={onSelectLaunchMode}
                repoViewMode={repoViewMode}
                onChangeRepoViewMode={onChangeRepoViewMode}
                localViewMode={localViewMode}
                onChangeLocalViewMode={onChangeLocalViewMode}
                onRefreshLocal={onRefreshLocal}
                showToast={showToast}
              />
            )}
            {section === 'changelog' && <ChangelogSection />}
            {section === 'credits' && (
              <CreditsSection config={config} bridgeStatus={bridgeStatus} showToast={showToast} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
