import { BookmarkCheck, Car, ExternalLink, Lock, Map, RefreshCw, Trash2, Unlock } from 'lucide-react';
import type { LocalMod } from '../types';
import { formatBytes } from '../utils';
import { UI_TEXT, getCategoryLabel } from '../i18n';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Switch } from './ui/switch';

export interface LocalModRowProps {
  mod: LocalMod;
  viewMode?: 'compact' | 'detailed';
  busy: boolean;
  onToggle: () => void;
  onPin: () => void;
  onDelete: () => void;
  onUpdate: () => void;
  onOpenModPage: () => void;
}

export function LocalModRow({
  mod,
  viewMode = 'compact',
  busy,
  onToggle,
  onPin,
  onDelete,
  onUpdate,
  onOpenModPage,
}: LocalModRowProps) {
  const t = UI_TEXT;
  const isDetailed = viewMode === 'detailed';
  const catLabel = getCategoryLabel(mod.category);
  const originLabel = mod.originDir === 'repo' ? 'mods/repo/' : 'mods/';
  const locationSuffix =
    mod.location === 'staging' ? ' · Staging' : mod.location === 'unpacked' ? ' · Unpacked' : '';

  const hoverReveal = isDetailed
    ? ''
    : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity';

  return (
    <div
      onClick={onOpenModPage}
      className={`group flex items-center justify-between gap-4 transition-colors cursor-pointer select-none ${
        isDetailed ? 'p-3.5' : 'px-4 py-2.5'
      } ${
        isDetailed && mod.hasUpdate
          ? 'bg-[#2b221e] hover:bg-[#33251d] border-l-2 border-l-[#ff6600]'
          : 'bg-[#222733] hover:bg-[#2d221c]'
      } ${!mod.active ? 'opacity-60 hover:opacity-100' : ''}`}
    >
      <div className="flex items-center gap-3.5 min-w-0 flex-1">
        {mod.iconUrl ? (
          <img
            src={mod.iconUrl}
            alt={mod.title}
            className={`${isDetailed ? 'w-14 h-14' : 'w-10 h-10'} rounded-sm object-cover bg-[#161922] border border-[#323949] shrink-0`}
            loading="lazy"
          />
        ) : (
          <div
            className={`${isDetailed ? 'w-14 h-14' : 'w-10 h-10'} rounded-sm bg-[#161922] border border-[#323949] flex items-center justify-center shrink-0 text-zinc-400`}
          >
            {mod.category === 'terrain' ? (
              <Map className={`${isDetailed ? 'w-5 h-5' : 'w-4 h-4'} text-amber-500`} />
            ) : (
              <Car className={`${isDetailed ? 'w-5 h-5' : 'w-4 h-4'} text-[#ff6600]`} />
            )}
          </div>
        )}

        <div className={`min-w-0 flex-1 ${isDetailed ? 'space-y-1.5' : 'space-y-0.5'}`}>
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <h4 className={`font-semibold text-zinc-100 truncate ${isDetailed ? 'text-sm' : 'text-xs'}`}>
              {mod.title}
            </h4>
            <span className="text-xs font-mono tabular-nums text-zinc-400 shrink-0">
              v{mod.version}
            </span>
            {isDetailed && (
              <span className="text-xs text-zinc-400 truncate">by {mod.author}</span>
            )}
            {!isDetailed && mod.pinned && (
              <span title={t.pinnedBadge} className="inline-flex items-center shrink-0">
                <Lock className="w-3 h-3 text-amber-400" />
              </span>
            )}
            {!isDetailed && mod.subscribed === true && (
              <span
                title={t.subscribedBadge}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-[#ff6600]/15 border border-[#ff6600]/35 text-[11px] font-medium text-[#ff8533] shrink-0"
              >
                <BookmarkCheck className="w-3 h-3" />
                <span>{t.subscribedBadge}</span>
              </span>
            )}
            {mod.hasUpdate && (
              <Button
                variant="amber"
                size="xs"
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdate();
                }}
                className="font-mono tabular-nums shrink-0"
                title={t.updateBtn}
              >
                <RefreshCw className="w-2.5 h-2.5" />
                <span>Update -&gt; v{mod.latestVersion}</span>
              </Button>
            )}
          </div>

          {isDetailed ? (
            <div className="flex items-center flex-wrap gap-1.5">
              <Badge variant="outline" className="text-[11px] font-mono">
                Origin: {originLabel}
              </Badge>
              <Badge variant="secondary" className="text-[11px]">
                {catLabel}
              </Badge>
              <Badge variant="secondary" className="text-[11px] font-mono tabular-nums">
                {formatBytes(mod.sizeBytes)}
              </Badge>
              {mod.tagId && (
                <Badge variant="outline" className="text-[11px] font-mono">
                  {mod.tagId}
                </Badge>
              )}
              {mod.subscribed === true && (
                <Badge variant="default" className="text-[11px]">
                  <BookmarkCheck className="w-3 h-3" />
                  <span>{t.subscribedBadge}</span>
                </Badge>
              )}
              {mod.pinned && (
                <Badge variant="warning" className="text-[11px]">
                  <Lock className="w-3 h-3" />
                  <span>{t.pinnedBadge}</span>
                </Badge>
              )}
              {mod.location === 'staging' && (
                <Badge variant="warning" className="text-[11px]">
                  {t.stagedBadge}
                </Badge>
              )}
              {mod.location === 'unpacked' && (
                <Badge variant="outline" className="text-[11px]">
                  Unpacked
                </Badge>
              )}
            </div>
          ) : (
            <p className="text-xs text-zinc-400 truncate">
              {mod.author} · {catLabel} ·{' '}
              <span className="font-mono tabular-nums">{formatBytes(mod.sizeBytes)}</span>
              {locationSuffix}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            onOpenModPage();
          }}
          title={t.modPageBtn}
          className={hoverReveal}
        >
          <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
        </Button>

        <Button
          variant={mod.pinned ? 'amber' : 'ghost'}
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            onPin();
          }}
          title={mod.pinned ? t.pinTitleLocked : t.pinTitleUnlocked}
          className={mod.pinned ? '' : hoverReveal}
        >
          {mod.pinned ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          disabled={mod.pinned || busy}
          title={mod.pinned ? t.deleteProtectedTitle : t.deleteModTitle}
          className={`text-zinc-400 hover:text-red-300 hover:bg-red-950/50 ${hoverReveal}`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>

        <div className="pl-1.5">
          <Switch
            checked={mod.active}
            onCheckedChange={() => onToggle()}
            disabled={busy || mod.location === 'unpacked'}
            title={
              mod.location === 'unpacked'
                ? 'Unpacked folder mod'
                : mod.active
                ? t.statusActive
                : t.statusDisabled
            }
          />
        </div>
      </div>
    </div>
  );
}
