import { Pause, Play } from 'lucide-react';
import type { DownloadSummary } from '../hooks/useDownloadManager';
import { UI_TEXT } from '../i18n';
import { cn, formatBytes } from '../utils';

export interface DownloadMiniStripProps {
  summary: DownloadSummary;
  onPauseAll: () => void;
  onResumeAll: () => void;
  onOpenManager: () => void;
}

function getSummaryLabel(summary: DownloadSummary): string {
  const { runningTasks, queuedTasks, pausedTasks, failedTasks, isPausedAll } = summary;
  const parts: string[] = [];
  if (runningTasks.length > 0) parts.push(`${runningTasks.length} Downloading`);
  if (queuedTasks.length > 0) parts.push(`${queuedTasks.length} Queued`);
  if (isPausedAll || (runningTasks.length === 0 && pausedTasks.length > 0)) {
    parts.push(`${pausedTasks.length} Paused`);
  }
  if (failedTasks.length > 0) parts.push(`${failedTasks.length} Failed`);
  return parts.join(' · ') || 'Idle';
}

export function DownloadMiniStrip({
  summary,
  onPauseAll,
  onResumeAll,
  onOpenManager,
}: DownloadMiniStripProps) {
  const t = UI_TEXT;
  if (!summary.hasVisibleActivity) return null;

  const { activeTasks, runningTasks, failedTasks, totalSpeedBps, overallPercent, isPausedAll } = summary;
  const topTask = runningTasks[0] ?? activeTasks[0] ?? failedTasks[0];
  const failedOnly = activeTasks.length === 0 && failedTasks.length > 0;

  return (
    <footer className="h-9 px-4 bg-[#1c202a] border-t border-[#323949] flex items-center justify-between gap-3 shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <span
          className={cn(
            'text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap shrink-0',
            failedOnly ? 'text-red-400' : isPausedAll ? 'text-amber-300' : 'text-[#ff6600]',
          )}
        >
          {getSummaryLabel(summary)}
        </span>

        {topTask && (
          <span className="text-xs text-zinc-300 truncate max-w-[260px]" title={topTask.title}>
            {topTask.title}
          </span>
        )}

        {activeTasks.length > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-28 h-1.5 bg-[#161922] rounded-sm overflow-hidden">
              <div
                className={cn('h-full transition-all', isPausedAll ? 'bg-amber-400' : 'bg-[#ff6600]')}
                style={{ width: `${Math.max(overallPercent, 4)}%` }}
              />
            </div>
            <span className="font-mono tabular-nums text-[11px] text-zinc-300">
              {overallPercent}%
            </span>
          </div>
        )}

        {runningTasks.length > 0 && (
          <span className="font-mono tabular-nums text-[11px] text-[#ff6600] shrink-0">
            {formatBytes(totalSpeedBps)}/s
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {activeTasks.length > 0 && (
          <button
            type="button"
            onClick={isPausedAll ? onResumeAll : onPauseAll}
            className="h-6 px-2 rounded-sm bg-[#282e3c] hover:bg-[#323949] border border-[#323949] text-zinc-200 text-[11px] font-medium inline-flex items-center gap-1 cursor-pointer"
          >
            {isPausedAll ? (
              <>
                <Play className="w-3 h-3" />
                <span>{t.resumeAllBtn}</span>
              </>
            ) : (
              <>
                <Pause className="w-3 h-3" />
                <span>{t.pauseAllBtn}</span>
              </>
            )}
          </button>
        )}

        <button
          type="button"
          onClick={onOpenManager}
          className="h-6 px-2.5 rounded-sm bg-[#ff6600] hover:bg-[#e65c00] text-white text-[11px] font-semibold cursor-pointer whitespace-nowrap"
        >
          {t.openManagerBtn}
        </button>
      </div>
    </footer>
  );
}
