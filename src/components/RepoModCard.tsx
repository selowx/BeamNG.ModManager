import { CheckCircle2, Clock, Download, Package, Pause, RefreshCw, Star } from 'lucide-react';
import type { RepoModItem } from '../types';
import { UI_TEXT, getCategoryLabel } from '../i18n';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { LoadingImage } from './ui/LoadingImage';
import type { RepoViewMode } from '../utils';
import { RepoModRow } from './RepoModRow';
import { RepoModWideCard } from './RepoModWideCard';

export interface RepoModCardProps {
  item: RepoModItem;
  viewMode?: RepoViewMode;
  isDownloading: boolean;
  downloadStatus?: string;
  onOpenDetails: (item: RepoModItem) => void;
  onInstallMod: (resourceId: number, slug: string, title: string) => void;
}

export function formatRepoUpdatedDate(item: RepoModItem): string {
  if (item.updatedText && item.updatedText.trim()) return item.updatedText.trim();
  if (!item.updatedTimestamp || item.updatedTimestamp <= 0) return '';
  const ms = item.updatedTimestamp > 1e11 ? item.updatedTimestamp : item.updatedTimestamp * 1000;
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function RepoInstallAction({
  item,
  isDownloading,
  downloadStatus,
  onInstallMod,
}: Pick<RepoModCardProps, 'item' | 'isDownloading' | 'downloadStatus' | 'onInstallMod'>) {
  const t = UI_TEXT;
  return (
    <div onClick={(e) => e.stopPropagation()} className="shrink-0">
      {isDownloading ? (
        <Badge
          variant={downloadStatus === 'paused' ? 'warning' : downloadStatus === 'queued' ? 'secondary' : 'default'}
          className="py-1 text-[11px]"
        >
          {downloadStatus === 'paused' ? (
            <>
              <Pause className="w-3 h-3" />
              <span>Paused</span>
            </>
          ) : downloadStatus === 'queued' ? (
            <>
              <Clock className="w-3 h-3" />
              <span>Queued</span>
            </>
          ) : downloadStatus === 'verifying' ? (
            <>
              <RefreshCw className="w-3 h-3 animate-spin" />
              <span>Verifying</span>
            </>
          ) : (
            <>
              <RefreshCw className="w-3 h-3 animate-spin" />
              <span>{t.downloading}</span>
            </>
          )}
        </Badge>
      ) : item.installStatus === 'installed' ? (
        <Badge variant="success" className="py-1 text-[11px]">
          <CheckCircle2 className="w-3 h-3" />
          <span>{t.installed}</span>
        </Badge>
      ) : item.installStatus === 'update_available' ? (
        <Button size="sm" variant="amber" onClick={() => onInstallMod(item.resourceId, item.slug, item.title)}>
          <RefreshCw className="w-3 h-3" />
          <span>{t.updateBtn}</span>
        </Button>
      ) : item.installStatus === 'staged' ? (
        <Badge variant="warning" className="py-1 text-[11px]">
          {t.stagedBadge}
        </Badge>
      ) : (
        <Button size="sm" variant="default" onClick={() => onInstallMod(item.resourceId, item.slug, item.title)}>
          <Download className="w-3 h-3" />
          <span>{t.downloadBtn}</span>
        </Button>
      )}
    </div>
  );
}

export function RepoModCard({
  item,
  viewMode = 'compact',
  isDownloading,
  downloadStatus,
  onOpenDetails,
  onInstallMod,
}: RepoModCardProps) {
  if (viewMode === 'list') {
    return (
      <RepoModRow
        item={item}
        isDownloading={isDownloading}
        downloadStatus={downloadStatus}
        onOpenDetails={onOpenDetails}
        onInstallMod={onInstallMod}
      />
    );
  }

  if (viewMode === 'wide') {
    return (
      <RepoModWideCard
        item={item}
        isDownloading={isDownloading}
        downloadStatus={downloadStatus}
        onOpenDetails={onOpenDetails}
        onInstallMod={onInstallMod}
      />
    );
  }

  const t = UI_TEXT;
  const isUnhydrated = item.hydrated === false;
  const isHighlighted = isDownloading || item.installStatus === 'update_available';

  const iconFallback = (
    <div className="w-16 h-16 xl:w-[72px] xl:h-[72px] rounded-sm bg-[#161922] border border-[#323949] flex items-center justify-center shrink-0">
      <Package className="w-6 h-6 text-zinc-500" />
    </div>
  );

  return (
    <Card
      onClick={() => onOpenDetails(item)}
      className={`group flex flex-col justify-between p-3.5 xl:p-4 transition-colors cursor-pointer ${
        isHighlighted
          ? 'bg-[#33251d] border-[#ff6600]'
          : 'bg-[#222733] border-[#323949] hover:bg-[#2d221c] hover:border-[#ff6600]/70'
      }`}
    >
      <div>
        <div className="flex gap-3">
          <LoadingImage
            src={isUnhydrated ? '' : item.iconUrl}
            alt={item.title}
            loading="lazy"
            containerClassName="w-16 h-16 xl:w-[72px] xl:h-[72px] rounded-sm border border-[#323949] shrink-0"
            className="w-full h-full object-cover"
            fallback={iconFallback}
          />
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-xs text-zinc-100 group-hover:text-[#ff6600] transition-colors line-clamp-2 leading-snug">
              {item.title}
            </h3>
            {isUnhydrated ? (
              <p className="text-[11px] text-zinc-400 mt-1 truncate">{t.catalogMatchLabel}</p>
            ) : (
              <>
                <p className="text-[11px] text-zinc-400 mt-1 truncate">
                  {item.author} · <span className="font-mono tabular-nums text-zinc-300">v{item.version}</span> ·{' '}
                  {getCategoryLabel(item.category)}
                </p>
                {item.subscribed === true && (
                  <Badge variant="default" className="mt-1.5 text-[11px]">
                    {t.subscribedBadge}
                  </Badge>
                )}
              </>
            )}
          </div>
        </div>

        <p className={`text-xs mt-2.5 line-clamp-2 min-h-[2rem] ${isUnhydrated ? 'text-zinc-500' : 'text-zinc-400'}`}>
          {isUnhydrated ? t.loadingCardDetails : item.tagline || t.noDescription}
        </p>
      </div>

      <div className="mt-3 pt-2.5 border-t border-[#323949] flex items-center justify-between gap-2">
        {isUnhydrated ? (
          <span className="text-[11px] font-mono tabular-nums text-zinc-500">#{item.resourceId}</span>
        ) : (
          <div className="flex items-center gap-3 text-[11px] text-zinc-400">
            <span className="flex items-center gap-1 text-amber-400 font-medium tabular-nums">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              {item.rating > 0 ? item.rating.toFixed(1) : '-'}
            </span>
            <span className="flex items-center gap-1 font-mono tabular-nums">
              <Download className="w-3 h-3" />
              {item.downloads.toLocaleString('en-US')}
            </span>
          </div>
        )}

        <RepoInstallAction item={item} isDownloading={isDownloading} downloadStatus={downloadStatus} onInstallMod={onInstallMod} />
      </div>
    </Card>
  );
}
