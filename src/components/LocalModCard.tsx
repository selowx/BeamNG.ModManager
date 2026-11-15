import { BookmarkCheck, Car, ExternalLink, Lock, Map, RefreshCw, Trash2, Unlock } from 'lucide-react';
import type { LocalMod } from '../types';
import { formatBytes } from '../utils';
import { UI_TEXT, getCategoryLabel } from '../i18n';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Switch } from './ui/switch';

export interface LocalModCardProps {
  mod: LocalMod;
  busy: boolean;
  onToggle: () => void;
  onPin: () => void;
  onDelete: () => void;
  onUpdate: () => void;
  onOpenModPage: () => void;
}

export function LocalModCard({
  mod,
  busy,
  onToggle,
  onPin,
  onDelete,
  onUpdate,
  onOpenModPage,
}: LocalModCardProps) {
  const t = UI_TEXT;
  const catLabel = getCategoryLabel(mod.category);
  const originLabel = mod.originDir === 'repo' ? 'mods/repo/' : 'mods/';

  const cardStateClass = mod.hasUpdate
    ? 'bg-[#33251d] border-[#ff6600]'
    : !mod.active
    ? 'bg-[#1c202a] border-[#282e3c] opacity-70 hover:opacity-100 hover:border-[#3b4356]'
    : 'bg-[#222733] border-[#323949] hover:bg-[#2d221c] hover:border-[#ff6600]/70';

  return (
    <Card
      onClick={onOpenModPage}
      className={`group flex flex-col justify-between p-3.5 transition-colors cursor-pointer select-none ${cardStateClass}`}
    >
      <div>
        <div className="flex gap-3">
          {mod.iconUrl ? (
            <img
              src={mod.iconUrl}
              alt={mod.title}
              className="w-16 h-16 xl:w-[72px] xl:h-[72px] rounded-sm object-cover bg-[#161922] border border-[#323949] shrink-0"
              loading="lazy"
            />
          ) : (
            <div className="w-16 h-16 xl:w-[72px] xl:h-[72px] rounded-sm bg-[#161922] border border-[#323949] flex items-center justify-center shrink-0">
              {mod.category === 'terrain' ? (
                <Map className="w-6 h-6 text-amber-500" />
              ) : (
                <Car className="w-6 h-6 text-[#ff6600]" />
              )}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-xs text-zinc-100 group-hover:text-[#ff6600] transition-colors line-clamp-2 leading-snug">
              {mod.title}
            </h3>
            <p className="text-[11px] text-zinc-400 mt-1 truncate">
              {mod.author} · <span className="font-mono tabular-nums text-zinc-300">v{mod.version}</span>
            </p>
            <div className="flex items-center flex-wrap gap-1.5 mt-2">
              <Badge variant="secondary" className="text-[11px]">
                {catLabel}
              </Badge>
              <Badge variant="outline" className="text-[11px] font-mono">
                {originLabel}
              </Badge>
              <Badge variant="secondary" className="text-[11px] font-mono tabular-nums">
                {formatBytes(mod.sizeBytes)}
              </Badge>
            </div>
          </div>
        </div>

        {(mod.subscribed === true || mod.pinned || mod.location === 'staging' || mod.location === 'unpacked') && (
          <div className="flex items-center flex-wrap gap-1.5 mt-2.5">
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
        )}

        {mod.hasUpdate && (
          <Button
            variant="amber"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onUpdate();
            }}
            className="w-full mt-2.5 font-mono tabular-nums"
            title={t.updateBtn}
          >
            <RefreshCw className="w-3 h-3" />
            <span>Update -&gt; v{mod.latestVersion}</span>
          </Button>
        )}
      </div>

      <div
        onClick={(e) => e.stopPropagation()}
        className="mt-3 pt-2.5 border-t border-[#323949] flex items-center justify-between gap-2"
      >
        <div className="flex items-center gap-2 min-w-0">
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
          <span className={`text-[11px] font-medium truncate ${mod.active ? 'text-zinc-200' : 'text-zinc-400'}`}>
            {mod.location === 'unpacked' ? 'Unpacked' : mod.active ? t.statusActive : t.statusDisabled}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              onOpenModPage();
            }}
            title={t.modPageBtn}
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
            className="text-zinc-400 hover:text-red-300 hover:bg-red-950/50"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
