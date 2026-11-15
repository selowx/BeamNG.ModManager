import { ArrowUpToLine, Pause, Play, RotateCcw, X } from 'lucide-react';
import type { DownloadTaskRecord } from '../types';
import { cn, formatBytes, formatEta } from '../utils';
import { Badge, type BadgeProps } from './ui/badge';
import { Button } from './ui/button';

export interface DownloadTaskRowProps {
  task: DownloadTaskRecord;
  onPause: (taskId: string) => void;
  onResume: (taskId: string) => void;
  onPrioritize: (taskId: string) => void;
  onRetry: (taskId: string) => void;
  onCancel: (taskId: string) => void;
}

const STATUS_META: Record<string, { label: string; variant: BadgeProps['variant'] }> = {
  downloading: { label: 'Downloading', variant: 'default' },
  resolving: { label: 'Resolving', variant: 'secondary' },
  verifying: { label: 'Verifying', variant: 'success' },
  queued: { label: 'Queued', variant: 'outline' },
  paused: { label: 'Paused', variant: 'warning' },
  error: { label: 'Failed', variant: 'destructive' },
  failed: { label: 'Failed', variant: 'destructive' },
};

export function DownloadTaskRow({
  task,
  onPause,
  onResume,
  onPrioritize,
  onRetry,
  onCancel,
}: DownloadTaskRowProps) {
  const isFailed = task.status === 'error' || task.status === 'failed';
  const isPaused = task.status === 'paused';
  const isQueued = task.status === 'queued';
  const isRunning =
    task.status === 'downloading' || task.status === 'resolving' || task.status === 'verifying';
  const meta = STATUS_META[task.status] ?? { label: task.status, variant: 'outline' as const };

  const pct =
    task.totalBytes > 0
      ? Math.min(100, Math.round((task.downloadedBytes / task.totalBytes) * 100))
      : 0;
  const etaText = task.status === 'downloading' ? formatEta(task.etaSeconds) : '';

  return (
    <div
      className={cn(
        'bg-[#222733] border rounded-sm px-2.5 py-2 space-y-1.5',
        isFailed ? 'border-red-900/60' : 'border-[#323949]',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Badge variant={meta.variant} className="shrink-0">
            {meta.label}
          </Badge>
          <span className="text-xs font-semibold text-zinc-100 truncate" title={task.title}>
            {task.title}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {(task.status === 'downloading' || task.status === 'resolving') && (
            <Button
              type="button"
              size="icon"
              variant="secondary"
              onClick={() => onPause(task.taskId)}
              title="Pause"
              aria-label="Pause"
              className="h-6 w-6"
            >
              <Pause className="w-3 h-3" />
            </Button>
          )}

          {isPaused && (
            <Button
              type="button"
              size="icon"
              variant="default"
              onClick={() => onResume(task.taskId)}
              title="Resume"
              aria-label="Resume"
              className="h-6 w-6"
            >
              <Play className="w-3 h-3" />
            </Button>
          )}

          {isQueued && (
            <Button
              type="button"
              size="icon"
              variant="secondary"
              onClick={() => onPrioritize(task.taskId)}
              title="Move to Top"
              aria-label="Move to Top"
              className="h-6 w-6"
            >
              <ArrowUpToLine className="w-3 h-3" />
            </Button>
          )}

          {isFailed && (
            <Button
              type="button"
              size="icon"
              variant="default"
              onClick={() => onRetry(task.taskId)}
              title="Retry"
              aria-label="Retry"
              className="h-6 w-6"
            >
              <RotateCcw className="w-3 h-3" />
            </Button>
          )}

          <Button
            type="button"
            size="icon"
            variant="secondary"
            onClick={() => onCancel(task.taskId)}
            title="Cancel"
            aria-label="Cancel"
            className="h-6 w-6 text-zinc-400 hover:bg-red-950/70 hover:text-red-300 hover:border-red-800/60"
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-zinc-400">
        <span>
          {formatBytes(task.downloadedBytes)} / {task.totalBytes > 0 ? formatBytes(task.totalBytes) : '--'}
          {task.totalBytes > 0 ? ` (${pct}%)` : ''}
        </span>
        <span className={cn(isRunning ? 'text-[#ff6600]' : isPaused ? 'text-amber-300' : 'text-zinc-400')}>
          {task.status === 'downloading' && task.speedBps > 0
            ? `${formatBytes(task.speedBps)}/s${etaText ? ` · ${etaText}` : ''}`
            : task.status === 'verifying'
            ? 'Verifying ZIP...'
            : task.status === 'resolving'
            ? 'Resolving URL...'
            : ''}
        </span>
      </div>

      {!isFailed && (
        <div className="w-full h-1.5 bg-[#161922] rounded-sm overflow-hidden">
          <div
            className={cn(
              'h-full transition-all',
              isPaused ? 'bg-amber-400' : isQueued ? 'bg-zinc-600' : 'bg-[#ff6600]',
            )}
            style={{ width: `${isQueued ? 8 : Math.max(pct, isRunning ? 3 : 0)}%` }}
          />
        </div>
      )}

      {isFailed && task.message && (
        <p className="text-[11px] font-mono text-red-300 truncate" title={task.message}>
          {task.message}
        </p>
      )}
    </div>
  );
}
