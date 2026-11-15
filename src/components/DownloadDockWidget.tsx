import { Pause, Play } from 'lucide-react';
import type { DownloadSummary } from '../hooks/useDownloadManager';
import { UI_TEXT } from '../i18n';
import { cn, formatBytes } from '../utils';
import { Button } from './ui/button';

export interface DownloadDockWidgetProps {
  summary: DownloadSummary;
  panelOpen: boolean;
  onTogglePanel: () => void;
  onPauseAll: () => void;
  onResumeAll: () => void;
}

function getStatusLine(summary: DownloadSummary): string {
  const { runningTasks, queuedTasks, pausedTasks, failedTasks, isPausedAll } = summary;
  if (runningTasks.length > 0) {
    return queuedTasks.length > 0
      ? `${runningTasks.length} Downloading · ${queuedTasks.length} Queued`
      : `${runningTasks.length} Downloading`;
  }
  if (queuedTasks.length > 0) return `${queuedTasks.length} Queued`;
  if (isPausedAll || pausedTasks.length > 0) return 'Paused';
  if (failedTasks.length > 0) return `${failedTasks.length} Failed`;
  return 'Idle · Queue Empty';
}

export function DownloadDockWidget({
  summary,
  panelOpen,
  onTogglePanel,
  onPauseAll,
  onResumeAll,
}: DownloadDockWidgetProps) {
  const t = UI_TEXT;
  const {
    activeTasks, runningTasks, pausedTasks, queuedTasks, failedTasks,
    totalSpeedBps, overallPercent, isPausedAll, hasVisibleActivity,
  } = summary;

  const topTask = runningTasks[0] ?? queuedTasks[0] ?? pausedTasks[0] ?? failedTasks[0] ?? null;
  const statusLine = getStatusLine(summary);
  const failedOnly = activeTasks.length === 0 && failedTasks.length > 0;
  const toggleLabel = panelOpen ? `${t.closeManagerBtn} ◂` : `${t.openManagerBtn} ▸`;

  return (
    <div className="mt-auto pt-3 border-t border-[#323949] shrink-0 space-y-2">
      <div className="flex items-center justify-between gap-1 px-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          {t.downloadsTitle}
        </span>
        {hasVisibleActivity && (
          <span
            className={cn(
              'px-1.5 py-0.5 rounded-sm font-mono tabular-nums text-[11px] font-semibold',
              failedOnly
                ? 'bg-red-950/60 text-red-300 border border-red-800/60'
                : isPausedAll
                ? 'bg-amber-950/60 text-amber-300 border border-amber-700/60'
                : 'bg-[#ff6600]/15 text-[#ff6600]',
            )}
          >
            {statusLine}
          </span>
        )}
      </div>

      <div
        className={cn(
          'bg-[#222733] border rounded-sm p-2 space-y-2 transition-colors',
          panelOpen ? 'border-[#ff6600]' : 'border-[#323949]',
        )}
      >
        {!hasVisibleActivity ? (
          <div className="space-y-2">
            <div className="text-xs text-zinc-400 truncate">Idle · Queue Empty</div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              data-download-dock="true"
              onClick={onTogglePanel}
              className="w-full"
            >
              {toggleLabel}
            </Button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {topTask && (
              <div className="flex items-center justify-between gap-1.5 text-xs">
                <span className="truncate text-zinc-200 font-medium" title={topTask.title}>
                  {topTask.title}
                </span>
                <span
                  className={cn(
                    'font-mono tabular-nums text-[11px] shrink-0',
                    failedOnly ? 'text-red-400' : isPausedAll ? 'text-amber-300' : 'text-[#ff6600]',
                  )}
                >
                  {failedOnly
                    ? `${failedTasks.length} Err`
                    : isPausedAll
                    ? `${overallPercent}%`
                    : `${overallPercent}% · ${formatBytes(totalSpeedBps)}/s`}
                </span>
              </div>
            )}

            <div className="w-full h-1.5 bg-[#161922] rounded-sm overflow-hidden">
              <div
                className={cn(
                  'h-full transition-all',
                  failedOnly ? 'bg-red-500' : isPausedAll ? 'bg-amber-400' : 'bg-[#ff6600]',
                )}
                style={{ width: `${failedOnly ? 100 : Math.max(overallPercent, activeTasks.length > 0 ? 4 : 0)}%` }}
              />
            </div>

            <div className="flex items-center gap-1.5 pt-0.5">
              {activeTasks.length > 0 && (
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  data-download-dock="true"
                  onClick={isPausedAll ? onResumeAll : onPauseAll}
                  title={isPausedAll ? t.resumeAllBtn : t.pauseAllBtn}
                  aria-label={isPausedAll ? t.resumeAllBtn : t.pauseAllBtn}
                  className="shrink-0"
                >
                  {isPausedAll ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                </Button>
              )}
              <Button
                type="button"
                variant={panelOpen ? 'secondary' : 'default'}
                size="sm"
                data-download-dock="true"
                onClick={onTogglePanel}
                className="flex-1"
              >
                {toggleLabel}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
