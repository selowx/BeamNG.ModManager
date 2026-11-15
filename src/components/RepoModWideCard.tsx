import { BookmarkCheck, Calendar, Download, Package, Star } from 'lucide-react';
import type { RepoModItem } from '../types';
import { UI_TEXT, getCategoryLabel } from '../i18n';
import { Badge } from './ui/badge';
import { Card } from './ui/card';
import { LoadingImage } from './ui/LoadingImage';
import { RepoInstallAction, formatRepoUpdatedDate } from './RepoModCard';

export interface RepoModWideCardProps {
  item: RepoModItem;
  isDownloading: boolean;
  downloadStatus?: string;
  onOpenDetails: (item: RepoModItem) => void;
  onInstallMod: (resourceId: number, slug: string, title: string) => void;
}

export function RepoModWideCard({
  item,
  isDownloading,
  downloadStatus,
  onOpenDetails,
  onInstallMod,
}: RepoModWideCardProps) {
  const t = UI_TEXT;
  const isUnhydrated = item.hydrated === false;
  const isHighlighted = isDownloading || item.installStatus === 'update_available';
  const updatedDate = isUnhydrated ? '' : formatRepoUpdatedDate(item);
  const categoryLabel = getCategoryLabel(item.category);

  const statusPill = isDownloading
    ? { text: t.downloading, cls: 'bg-[#161922]/90 border-amber-500/60 text-amber-300' }
    : item.installStatus === 'installed'
    ? { text: t.installed, cls: 'bg-[#161922]/90 border-emerald-500/60 text-emerald-300' }
    : item.installStatus === 'update_available'
    ? { text: t.updateBtn, cls: 'bg-[#161922]/90 border-[#ff6600] text-[#ff6600]' }
    : item.installStatus === 'staged'
    ? { text: t.stagedBadge, cls: 'bg-[#161922]/90 border-amber-500/60 text-amber-300' }
    : null;

  const fallbackArtwork = (
    <div className="w-full h-full bg-[#161922] flex items-center justify-center">
      <Package className="w-8 h-8 text-zinc-600" />
    </div>
  );

  return (
    <Card
      onClick={() => onOpenDetails(item)}
      className={`group flex items-stretch h-36 sm:h-40 rounded-sm overflow-hidden transition-colors cursor-pointer ${
        isHighlighted
          ? 'bg-[#33251d] border-[#ff6600]'
          : 'bg-[#222733] border-[#323949] hover:bg-[#2d221c] hover:border-[#ff6600]'
      }`}
    >
      <div className="w-44 sm:w-52 shrink-0 bg-[#161922] border-r border-[#323949] relative overflow-hidden">
        <LoadingImage
          src={isUnhydrated ? '' : item.iconUrl}
          alt={item.title}
          loading="lazy"
          containerClassName="w-full h-full"
          className="w-full h-full object-cover"
          fallback={fallbackArtwork}
        />
        {(item.subscribed === true || statusPill) && (
          <div className="absolute top-2 left-2 right-2 flex flex-wrap items-center gap-1 pointer-events-none">
            {item.subscribed === true && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-[#161922]/90 border border-[#ff6600]/70 text-[11px] font-semibold text-[#ff6600]">
                <BookmarkCheck className="w-3 h-3" />
                <span>{t.subscribedBadge}</span>
              </span>
            )}
            {statusPill && (
              <span className={`px-1.5 py-0.5 rounded-sm border text-[11px] font-semibold ${statusPill.cls}`}>
                {statusPill.text}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="p-3.5 flex flex-col justify-between min-w-0 flex-1">
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-sm text-zinc-100 group-hover:text-[#ff6600] transition-colors line-clamp-1">
              {item.title}
            </h3>
            {!isUnhydrated && (
              <span className="text-[11px] font-mono tabular-nums text-zinc-300 shrink-0">
                v{item.version}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 mt-1 min-w-0">
            {isUnhydrated ? (
              <span className="text-[11px] text-zinc-400 truncate">{t.catalogMatchLabel}</span>
            ) : (
              <>
                <Badge variant="secondary" className="text-[11px] shrink-0">
                  {categoryLabel}
                </Badge>
                <span className="text-[11px] text-zinc-400 truncate">{item.author}</span>
              </>
            )}
          </div>

          <p className={`text-xs mt-2 line-clamp-2 ${isUnhydrated ? 'text-zinc-500' : 'text-zinc-400'}`}>
            {isUnhydrated ? t.loadingCardDetails : item.tagline || t.noDescription}
          </p>
        </div>

        <div className="pt-2 border-t border-[#323949] flex items-center justify-between gap-2">
          {isUnhydrated ? (
            <span className="text-[11px] font-mono tabular-nums text-zinc-500">#{item.resourceId}</span>
          ) : (
            <div className="flex items-center gap-3 text-[11px] text-zinc-400 min-w-0">
              <span className="flex items-center gap-1 text-amber-400 font-medium tabular-nums shrink-0">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                {item.rating > 0 ? item.rating.toFixed(1) : '-'}
              </span>
              <span className="flex items-center gap-1 font-mono tabular-nums shrink-0">
                <Download className="w-3 h-3" />
                {item.downloads.toLocaleString('en-US')}
              </span>
              {updatedDate && (
                <span className="hidden xl:flex items-center gap-1 font-mono tabular-nums truncate">
                  <Calendar className="w-3 h-3 shrink-0 text-zinc-500" />
                  {updatedDate}
                </span>
              )}
            </div>
          )}

          <RepoInstallAction item={item} isDownloading={isDownloading} downloadStatus={downloadStatus} onInstallMod={onInstallMod} />
        </div>
      </div>
    </Card>
  );
}
