import { useState, type MouseEvent } from 'react';
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import type { ModUpdateEntry } from '../types';
import { UI_TEXT } from '../i18n';
import { Button } from './ui/button';

export interface ModPatchNotesProps {
  updates: ModUpdateEntry[];
  loading?: boolean;
  canRetry?: boolean;
  onRetry?: () => void;
  onOpenExternalUrl?: (url: string) => void;
  onImageClick?: (src: string) => void;
}

export function ModPatchNotes({
  updates,
  loading = false,
  canRetry = false,
  onRetry,
  onOpenExternalUrl,
  onImageClick,
}: ModPatchNotesProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);
  const t = UI_TEXT;

  if ((!updates || updates.length === 0) && !loading && !canRetry) return null;

  const handleBodyClick = (e: MouseEvent<HTMLDivElement>) => {
    const img = (e.target as HTMLElement | null)?.closest('img');
    if (img && onImageClick) {
      e.preventDefault();
      const src = img.currentSrc || img.getAttribute('src') || '';
      if (src) onImageClick(src);
      return;
    }
    const anchor = (e.target as HTMLElement | null)?.closest('a');
    if (!anchor || !onOpenExternalUrl) return;
    const href = anchor.getAttribute('href');
    if (!href) return;
    e.preventDefault();
    if (/^https?:\/\//i.test(href)) onOpenExternalUrl(href);
    else if (href.startsWith('/')) onOpenExternalUrl(`https://www.beamng.com${href}`);
  };

  return (
    <section className="space-y-2.5">
      <h3 className="text-xs uppercase tracking-wider italic font-bold text-[#ff6600] border-b border-[#323949] pb-1.5">
        {t.changelogTitle}
      </h3>

      {updates.length === 0 ? (
        <div className="rounded-sm border border-[#323949] bg-[#1c202a] px-3.5 py-2.5 flex items-center justify-between gap-3">
          <span className="text-xs text-zinc-400">
            {loading ? t.loadingChangelog : t.changelogLoadFailed}
          </span>
          {canRetry && onRetry && (
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={loading}
              onClick={onRetry}
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              <span>{t.loadChangelogBtn}</span>
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {updates.map((u, idx) => {
            const isOpen = expandedIndex === idx;
            const key = u.id || `${u.title}-${u.dateText}-${idx}`;
            const safeBodyHtml = u.bodyHtml
              ? u.bodyHtml.replace(/<img\b(?![^>]*\breferrerpolicy=)/gi, '<img referrerpolicy="no-referrer" ')
              : '';
            return (
              <div
                key={key}
                className={`rounded-sm border bg-[#1c202a] overflow-hidden ${
                  isOpen ? 'border-[#ff6600]/60' : 'border-[#323949]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setExpandedIndex(isOpen ? null : idx)}
                  className="w-full px-3.5 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-[#282e3c] transition cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {isOpen ? (
                      <ChevronDown className="w-3.5 h-3.5 text-[#ff6600] shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    )}
                    <span className="text-xs font-semibold text-zinc-100 truncate">
                      {u.title || 'Update'}
                    </span>
                  </div>
                  {u.dateText && (
                    <span className="text-[11px] font-mono tabular-nums text-zinc-400 shrink-0">
                      {u.dateText}
                    </span>
                  )}
                </button>
                {isOpen && (
                  <div className="px-3.5 pb-3 pt-2 border-t border-[#323949]">
                    {safeBodyHtml ? (
                      <div
                        onClick={handleBodyClick}
                        className="ugc-content text-xs text-zinc-300 leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: safeBodyHtml }}
                      />
                    ) : (
                      <p className="text-xs text-zinc-400">No changelog notes provided.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
