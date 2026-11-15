import { Cpu, FolderOpen, Layers, Link2, User } from 'lucide-react';
import { api } from '../api';
import type { BeamNGConfig, BridgeStatus } from '../types';
import { UI_TEXT } from '../i18n';
import { BeamngEmblem } from './BeamngLogo';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import pkg from '../../package.json';

export interface CreditsSectionProps {
  config: BeamNGConfig | null;
  bridgeStatus: BridgeStatus | null;
  showToast: (text: string, type?: 'info' | 'success' | 'error') => void;
}

export function CreditsSection({ config, bridgeStatus, showToast }: CreditsSectionProps) {
  const t = UI_TEXT;

  const openFolder = async (folderType: 'install' | 'user' | 'mods', label: string) => {
    try {
      await api.openModFolder(folderType);
    } catch (err) {
      showToast(`Failed to open ${label}: ${String(err)}`, 'error');
    }
  };

  const bridgeSummary = !bridgeStatus?.installed
    ? `Not installed (Bundled v${bridgeStatus?.bundledVersion || '?'})`
    : bridgeStatus.runningVersion
    ? `Installed v${bridgeStatus.installedVersion || '?'} · Running v${bridgeStatus.runningVersion}`
    : `Installed v${bridgeStatus.installedVersion || '?'} (Bundled v${bridgeStatus.bundledVersion || '?'})`;

  const pathRows: { label: string; value: string | undefined; folderType: 'install' | 'user' | 'mods' }[] = [
    { label: t.settingsPathInstall, value: config?.installPath, folderType: 'install' },
    { label: t.settingsPathUser, value: config?.userPath, folderType: 'user' },
    { label: t.settingsPathMods, value: config?.modsPath, folderType: 'mods' },
  ];

  return (
    <div className="w-full max-w-6xl space-y-5">
      <Card className="p-4 bg-[#222733] border-[#323949] space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <BeamngEmblem className="w-9 h-9 shrink-0" />
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-base tracking-wide">
                  <span className="text-white italic font-bold">BeamNG</span>
                  <span className="text-[#ff6600] italic font-bold">.ModManager</span>
                </span>
                <Badge variant="outline" className="font-mono tabular-nums text-[11px]">
                  v{pkg.version}
                </Badge>
              </div>
              <p className="text-xs text-zinc-300">
                Desktop Mod Manager and Repository Client for BeamNG.drive.
              </p>
            </div>
          </div>
          {config?.version && (
            <Badge variant="secondary" className="font-mono tabular-nums text-[11px]">
              BeamNG v{config.version}
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-[#323949]">
          <div className="p-3 rounded-sm bg-[#1c202a] border border-[#323949] space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-[#ff6600]" />
              <span>Author &amp; Lead Developer</span>
            </div>
            <div className="text-xs font-medium text-zinc-100">Selim Günay</div>
          </div>
          <div className="p-3 rounded-sm bg-[#1c202a] border border-[#323949] space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-[#ff6600]" />
              <span>AI Engineering Assistant</span>
            </div>
            <div className="text-xs font-medium text-zinc-100">Antigravity (Google Deepmind)</div>
          </div>
          <div className="p-3 rounded-sm bg-[#1c202a] border border-[#323949] space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-[#ff6600]" />
              <span>Application Stack</span>
            </div>
            <div className="text-xs text-zinc-200">Tauri v2 / Rust · React 19 · TypeScript · Tailwind CSS v4</div>
          </div>
          <div className="p-3 rounded-sm bg-[#1c202a] border border-[#323949] space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5 text-[#ff6600]" />
              <span>{t.settingsCreditsStackTitle}</span>
            </div>
            <div className="text-xs font-mono tabular-nums text-zinc-200">{bridgeSummary}</div>
          </div>
        </div>
      </Card>

      <Card className="p-4 bg-[#222733] border-[#323949] space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">{t.settingsDetectedPathsTitle}</h3>
        <div className="divide-y divide-[#323949] border border-[#323949] rounded-sm bg-[#1c202a]">
          {pathRows.map((row) => (
            <div key={row.folderType} className="p-3 flex items-center justify-between gap-4">
              <div className="min-w-0 space-y-0.5">
                <div className="text-xs font-semibold text-zinc-200">{row.label}</div>
                <div className="text-xs font-mono text-zinc-400 truncate" title={row.value || ''}>
                  {row.value || 'Not detected'}
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                disabled={!row.value}
                onClick={() => void openFolder(row.folderType, row.label)}
              >
                <FolderOpen className="w-3.5 h-3.5 text-[#ff6600]" />
                <span>{t.settingsOpenBtn}</span>
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
