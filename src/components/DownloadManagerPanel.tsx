import { useEffect, useRef, useState } from 'react';
import type { DownloadManagerController } from '../hooks/useDownloadManager';
import type { DownloadSettings } from '../types';
import { UI_TEXT } from '../i18n';
import { cn, formatBytes } from '../utils';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { DownloadTaskRow } from './DownloadTaskRow';

type PanelTab = 'active' | 'failed' | 'history' | 'limits';

const SPEED_OPTIONS = [
  { label: 'Unlimited', bps: 0 },
  { label: '2 MB/s', bps: 2 * 1024 * 1024 },
  { label: '5 MB/s', bps: 5 * 1024 * 1024 },
  { label: '10 MB/s', bps: 10 * 1024 * 1024 },
] as const;

export interface DownloadManagerPanelProps {
  manager: DownloadManagerController;
  onClose: () => void;
}

export function DownloadManagerPanel({ manager, onClose }: DownloadManagerPanelProps) {
  const t = UI_TEXT;
  const panelRef = useRef<HTMLDivElement | null>(null);
  const { summary, history, settings } = manager;
  const [tab, setTab] = useState<PanelTab>(() =>
    summary.activeTasks.length === 0 && summary.failedTasks.length > 0 ? 'failed' : 'active',
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target || panelRef.current?.contains(target) || target.closest('[data-download-dock]')) return;
      onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [onClose]);

  const updateSetting = (patch: Partial<DownloadSettings>) => void manager.updateSettings({ ...settings, ...patch });
  const speedPill = settings.speedLimitBps > 0 ? `${Math.round(settings.speedLimitBps / 1048576)} MB/s` : 'Unlimited';

  const rowHandlers = {
    onPause: (id: string) => void manager.pauseTask(id),
    onResume: (id: string) => void manager.resumeTask(id),
    onPrioritize: (id: string) => void manager.prioritizeTask(id),
    onRetry: (id: string) => void manager.retryTask(id),
    onCancel: (id: string) => void manager.cancelTask(id),
  };

  const tabs: { id: PanelTab; label: string }[] = [
    { id: 'active', label: `${t.dlTabQueue} (${summary.activeTasks.length})` },
    { id: 'failed', label: `${t.dlTabFailed} (${summary.failedTasks.length})` },
    { id: 'history', label: `${t.dlTabHistory} (${history.length})` },
    { id: 'limits', label: t.dlTabLimits },
  ];

  const optBtn = (active: boolean) =>
    cn(
      'h-6 px-2 text-[11px] rounded-sm border inline-flex items-center justify-center cursor-pointer whitespace-nowrap transition-colors',
      active ? 'bg-[#ff6600] border-[#ff6600] text-white font-semibold' : 'bg-[#282e3c] border-[#323949] text-zinc-300 hover:text-white',
    );

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Download Manager"
      className="absolute bottom-3 left-[226px] w-[520px] max-w-[calc(100vw-245px)] h-[240px] z-30 bg-[#1c202a] border border-[#323949] border-l-2 border-l-[#ff6600] rounded-sm shadow-xl shadow-black/50 flex flex-col overflow-hidden"
    >
      <div className="px-2.5 py-1.5 bg-[#161922] border-b border-[#323949] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-100 whitespace-nowrap">
            Download Manager
          </span>
          <span className="px-1.5 py-0.5 rounded-sm bg-[#222733] border border-[#323949] font-mono tabular-nums text-[11px] text-zinc-300 whitespace-nowrap">
            {settings.maxConcurrent}x · {speedPill}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {summary.activeTasks.length > 0 && (
            <Button
              type="button"
              size="xs"
              variant="secondary"
              onClick={summary.isPausedAll ? () => void manager.resumeAll() : () => void manager.pauseAll()}
            >
              {summary.isPausedAll ? t.resumeAllBtn : t.pauseAllBtn}
            </Button>
          )}
          {summary.failedTasks.length > 0 && (
            <Button
              type="button"
              size="xs"
              variant="default"
              onClick={() => void manager.retryAllFailed()}
            >
              {t.retryAllBtn}
            </Button>
          )}
          {summary.activeTasks.length > 0 && (
            <Button
              type="button"
              size="xs"
              variant="destructive"
              onClick={() => void manager.cancelAll()}
            >
              {t.cancelAllBtn}
            </Button>
          )}
          {history.length > 0 && (
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => void manager.clearHistory()}
            >
              {t.clearHistoryBtn}
            </Button>
          )}
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={onClose}
          >
            ◂ {t.closeManagerBtn}
          </Button>
        </div>
      </div>

      <div className="px-2.5 py-1 bg-[#161922] border-b border-[#323949] flex items-center gap-1 shrink-0">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              'px-2 py-0.5 rounded-sm text-[11px] font-semibold font-mono tabular-nums transition-colors cursor-pointer whitespace-nowrap',
              tab === item.id ? 'bg-[#ff6600] text-white' : 'bg-[#222733] text-zinc-400 hover:text-zinc-100 hover:bg-[#282e3c]',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5 bg-[#1c202a]">
        {tab === 'active' &&
          (summary.activeTasks.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-zinc-500">No active downloads in queue.</div>
          ) : (
            summary.activeTasks.map((task) => <DownloadTaskRow key={task.taskId} task={task} {...rowHandlers} />)
          ))}

        {tab === 'failed' &&
          (summary.failedTasks.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-zinc-500">No failed downloads.</div>
          ) : (
            summary.failedTasks.map((task) => <DownloadTaskRow key={task.taskId} task={task} {...rowHandlers} />)
          ))}

        {tab === 'history' &&
          (history.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-zinc-500">No completed downloads yet.</div>
          ) : (
            history.map((entry) => (
              <div
                key={entry.taskId}
                className="bg-[#222733] border border-[#323949] rounded-sm px-2.5 py-1.5 flex items-center justify-between gap-2 text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant={entry.status === 'staged' ? 'warning' : 'success'} className="shrink-0">
                    {entry.status === 'staged' ? 'Staged' : 'Installed'}
                  </Badge>
                  <div className="min-w-0">
                    <div className="font-medium text-zinc-100 truncate">{entry.title}</div>
                    {entry.filename && <div className="text-[11px] font-mono text-zinc-400 truncate">{entry.filename}</div>}
                  </div>
                </div>
                <span className="font-mono tabular-nums text-[11px] text-zinc-400 shrink-0">{formatBytes(entry.sizeBytes)}</span>
              </div>
            ))
          ))}

        {tab === 'limits' && (
          <div className="space-y-2 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-[#222733] border border-[#323949] rounded-sm p-2 flex items-center justify-between gap-2">
                <span className="text-zinc-300 font-medium">{t.dlParallelLabel}</span>
                <div className="flex items-center gap-1">
                  {[1, 2, 3].map((n) => (
                    <button key={n} type="button" onClick={() => updateSetting({ maxConcurrent: n })} className={cn(optBtn(settings.maxConcurrent === n), 'font-mono tabular-nums')}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-[#222733] border border-[#323949] rounded-sm p-2 flex items-center justify-between gap-2">
                <span className="text-zinc-300 font-medium">{t.dlSpeedCapLabel}</span>
                <div className="flex items-center gap-1 flex-wrap justify-end">
                  {SPEED_OPTIONS.map((opt) => (
                    <button key={opt.bps} type="button" onClick={() => updateSetting({ speedLimitBps: opt.bps })} className={cn(optBtn(settings.speedLimitBps === opt.bps), 'font-mono tabular-nums')}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-[#222733] border border-[#323949] rounded-sm p-2 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="text-zinc-300 font-medium mr-1">{t.dlOnFinishLabel}:</span>
                <button type="button" onClick={() => updateSetting({ postDownloadMode: 'enabled' })} className={optBtn(settings.postDownloadMode === 'enabled')}>
                  {t.dlAutoEnable}
                </button>
                <button type="button" onClick={() => updateSetting({ postDownloadMode: 'disabled' })} className={optBtn(settings.postDownloadMode === 'disabled')}>
                  {t.dlKeepDisabled}
                </button>
              </div>
              <div className="inline-flex items-center gap-2 text-zinc-300 select-none">
                <Switch
                  checked={settings.addToActiveProfile}
                  onCheckedChange={(val) => updateSetting({ addToActiveProfile: val })}
                />
                <span
                  onClick={() => updateSetting({ addToActiveProfile: !settings.addToActiveProfile })}
                  className="text-[11px] cursor-pointer"
                >
                  {t.dlAddToActiveProfile}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
