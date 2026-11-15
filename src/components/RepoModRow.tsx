import { BookmarkCheck, Calendar, Download, Package, Star } from 'lucide-react';
import type { RepoModItem } from '../types';
import { UI_TEXT, getCategoryLabel } from '../i18n';
import { Badge } from './ui/badge';
import { LoadingImage } from './ui/LoadingImage';
import { RepoInstallAction, formatRepoUpdatedDate } from './RepoModCard';

export interface RepoModRowProps {
  item: RepoModItem;
  isDownloading: boolean;
  downloadStatus?: string;
  onOpenDetails: (item: RepoModItem) => void;
  onInstallMod: (resourceId: number, slug: string, title: string) => void;
}

export function RepoModRow({
  item,
  isDownloading,
  downloadStatus,
  onOpenDetails,
  onInstallMod,
}: RepoModRowProps) {
  const t = UI_TEXT;
  const isUnhydrated = item.hydrated === false;
  const isHighlighted = isDownloading || item.installStatus === 'update_available';
  const updatedDate = isUnhydrated ? '' : formatRepoUpdatedDate(item);
  const categoryLabel = getCategoryLabel(item.category);

  const iconFallback = (
    <div className="w-10 h-10 rounded-sm bg-[#161922] border border-[#323949] flex items-center justify-center shrink-0">
      <Package className="w-4 h-4 text-zinc-500" />
    </div>
  );

  return (
    <div
      onClick={() => onOpenDetails(item)}
      className={`group px-4 py-2.5 flex items-center justify-between gap-4 transition-colors cursor-pointer select-none ${
        isHighlighted
          ? 'bg-[#2b221e] hover:bg-[#33251d] border-l-2 border-l-[#ff6600]'
          : 'bg-[#222733] hover:bg-[#2d221c]'
      }`}
    >
      <div className="flex items-center gap-3.5 min-w-0 flex-1">
        <LoadingImage
          src={isUnhydrated ? '' : item.iconUrl}
          alt={item.title}
          loading="lazy"
          containerClassName="w-10 h-10 rounded-sm border border-[#323949] shrink-0"
          className="w-full h-full object-cover"
          fallback={iconFallback}
        />

        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <h4 className="font-semibold text-xs text-zinc-100 group-hover:text-[#ff6600] transition-colors truncate">
              {item.title}
            </h4>
            {!isUnhydrated && (
              <span className="text-xs font-mono tabular-nums text-zinc-400 shrink-0">
                v{item.version}
              </span>
            )}
            {!isUnhydrated && (
              <Badge variant="secondary" className="text-[11px] shrink-0">
                {categoryLabel}
              </Badge>
            )}
            {item.subscribed === true && (
              <Badge variant="default" className="text-[11px] shrink-0">
                <BookmarkCheck className="w-3 h-3" />
                <span>{t.subscribedBadge}</span>
              </Badge>
            )}
          </div>

          <p className="text-xs text-zinc-400 truncate">
            {isUnhydrated ? (
              <span>
                {t.catalogMatchLabel} · <span className="font-mono tabular-nums">#{item.resourceId}</span>
              </span>
            ) : (
              <>
                <span className="text-zinc-300">{item.author}</span>
                {item.tagline ? ` · ${item.tagline}` : ''}
              </>
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4 shrink-0">
        {!isUnhydrated && (
          <div className="hidden sm:flex items-center gap-3.5 text-[11px] text-zinc-400">
            <span className="flex items-center gap-1 text-amber-400 font-medium tabular-nums">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              {item.rating > 0 ? item.rating.toFixed(1) : '-'}
            </span>
            <span className="flex items-center gap-1 font-mono tabular-nums">
              <Download className="w-3 h-3" />
              {item.downloads.toLocaleString('en-US')}
            </span>
            {updatedDate && (
              <span className="hidden md:flex items-center gap-1 font-mono tabular-nums">
                <Calendar className="w-3 h-3 text-zinc-500" />
                {updatedDate}
              </span>
            )}
          </div>
        )}

        <RepoInstallAction item={item} isDownloading={isDownloading} downloadStatus={downloadStatus} onInstallMod={onInstallMod} />
      </div>
    </div>
  );
}
