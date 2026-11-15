import { useMemo, useState } from 'react';
import { Download, Lock, Plus, Search, Trash2, X } from 'lucide-react';
import type { LocalMod, ModProfile, ProfileModRef } from '../../types';
import { UI_TEXT } from '../../i18n';
import { cn, formatBytes } from '../../utils';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';

export interface ProfileModListProps {
  profile: ModProfile;
  localMods: LocalMod[];
  busy: boolean;
  onSetProfileMods: (modIds: string[]) => Promise<unknown>;
  onQueueDownload: (refs: ProfileModRef[]) => Promise<unknown>;
}

function LocalStatusBadges({ mod }: { mod: LocalMod }) {
  const t = UI_TEXT;
  return (
    <>
      <Badge variant={mod.active ? 'success' : 'secondary'}>
        {mod.active ? t.statusActive : t.statusDisabled}
      </Badge>
      {mod.pinned && (
        <Badge variant="outline" className="text-amber-300 border-amber-500/40">
          <Lock className="w-2.5 h-2.5" />
          {t.pinnedBadge}
        </Badge>
      )}
    </>
  );
}

export function ProfileModList({
  profile,
  localMods,
  busy,
  onSetProfileMods,
  onQueueDownload,
}: ProfileModListProps) {
  const t = UI_TEXT;
  const [subTab, setSubTab] = useState<'in_profile' | 'add_mods'>('in_profile');
  const [search, setSearch] = useState('');

  const localById = useMemo(() => new Map(localMods.map((m) => [m.id, m])), [localMods]);
  const profileIdSet = useMemo(() => new Set(profile.modIds), [profile.modIds]);
  const availableToAdd = useMemo(() => localMods.filter((m) => !profileIdSet.has(m.id)), [localMods, profileIdSet]);
  const query = search.trim().toLowerCase();

  const profileRows = useMemo(
    () =>
      profile.modIds
        .map((modId) => {
          const local = localById.get(modId) ?? null;
          const ref = profile.modRefs[modId] ?? null;
          return {
            modId,
            local,
            ref,
            title: local?.title || ref?.title || modId,
            filename: local?.filename || ref?.filename || modId,
            author: local?.author || ref?.author || 'Unknown',
            sizeBytes: local?.sizeBytes ?? ref?.sizeBytes ?? 0,
            hasRepo: Boolean(ref?.resourceId && ref.resourceId > 0 && ref?.slug),
          };
        })
        .filter(
          (row) =>
            !query ||
            row.title.toLowerCase().includes(query) ||
            row.filename.toLowerCase().includes(query) ||
            row.author.toLowerCase().includes(query) ||
            row.modId.toLowerCase().includes(query),
        ),
    [localById, profile.modIds, profile.modRefs, query],
  );

  const addableRows = useMemo(
    () =>
      !query
        ? availableToAdd
        : availableToAdd.filter(
            (m) =>
              m.title.toLowerCase().includes(query) ||
              m.filename.toLowerCase().includes(query) ||
              m.author.toLowerCase().includes(query),
          ),
    [availableToAdd, query],
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 shrink-0">
        <div className="flex items-center gap-1 bg-[#1c202a] border border-[#323949] rounded-sm p-0.5">
          {([
            { id: 'in_profile', label: t.inProfileTab, count: profile.modIds.length },
            { id: 'add_mods', label: t.addModsTab, count: availableToAdd.length },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id)}
              className={cn(
                'px-2.5 py-1 rounded-sm text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap',
                subTab === tab.id ? 'bg-[#ff6600] text-white' : 'text-zinc-400 hover:text-zinc-100',
              )}
            >
              <span>{tab.label}</span>
              <span className="ml-1 font-mono tabular-nums opacity-85">({tab.count})</span>
            </button>
          ))}
        </div>

        <div className="flex items-center w-64 max-w-full h-8 rounded-sm border border-[#323949] bg-[#161922] focus-within:border-[#ff6600] focus-within:ring-1 focus-within:ring-[#ff6600]/40 overflow-hidden">
          <Search className="w-3.5 h-3.5 text-zinc-400 ml-2.5 shrink-0 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter profile mods..."
            className="flex-1 min-w-0 h-full bg-transparent px-2.5 text-xs text-zinc-100 placeholder:text-zinc-400 outline-none"
          />
          {search.length > 0 && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="w-8 h-full shrink-0 flex items-center justify-center text-zinc-400 hover:text-zinc-100 cursor-pointer"
              aria-label={t.closeTitle}
              title={t.closeTitle}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto border border-[#323949] rounded-sm bg-[#222733] divide-y divide-[#323949]">
        {subTab === 'in_profile' ? (
          profileRows.length === 0 ? (
            <div className="p-6 text-center text-xs text-zinc-400">
              {profile.modIds.length === 0
                ? 'This profile has no mods yet. Switch to "Add Installed Mods" to populate it.'
                : 'No mods in this profile match your search.'}
            </div>
          ) : (
            profileRows.map((row) => (
              <div key={row.modId} className="px-3 py-2 flex items-center justify-between gap-3 hover:bg-[#282e3c]/70 transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-semibold text-zinc-100 truncate">{row.title}</span>
                    {row.local ? (
                      <LocalStatusBadges mod={row.local} />
                    ) : row.hasRepo ? (
                      <Badge variant="warning">Missing · Repo</Badge>
                    ) : (
                      <Badge variant="destructive">Missing · External</Badge>
                    )}
                  </div>
                  <div className="text-[11px] text-zinc-400 font-mono truncate mt-0.5">
                    {row.filename} · by {row.author}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {row.sizeBytes > 0 && (
                    <span className="text-[11px] font-mono tabular-nums text-zinc-400">{formatBytes(row.sizeBytes)}</span>
                  )}
                  {!row.local && row.hasRepo && row.ref && (
                    <Button variant="default" size="xs" disabled={busy} onClick={() => void onQueueDownload([row.ref!])}>
                      <Download className="w-3 h-3" />
                      {t.queueDownloadBtn}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={busy}
                    title="Remove mod from profile"
                    onClick={() => void onSetProfileMods(profile.modIds.filter((id) => id !== row.modId))}
                  >
                    <Trash2 className="w-3 h-3 text-zinc-400" />
                    <span>Remove</span>
                  </Button>
                </div>
              </div>
            ))
          )
        ) : addableRows.length === 0 ? (
          <div className="p-6 text-center text-xs text-zinc-400">
            {availableToAdd.length === 0 ? 'All installed mods are already included in this profile.' : 'No installed mods match your search.'}
          </div>
        ) : (
          addableRows.map((mod) => (
            <div key={mod.id} className="px-3 py-2 flex items-center justify-between gap-3 hover:bg-[#282e3c]/70 transition-colors">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-semibold text-zinc-100 truncate">{mod.title}</span>
                  <LocalStatusBadges mod={mod} />
                </div>
                <div className="text-[11px] text-zinc-400 font-mono truncate mt-0.5">
                  {mod.filename} · by {mod.author}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] font-mono tabular-nums text-zinc-400">{formatBytes(mod.sizeBytes)}</span>
                <Button variant="secondary" size="xs" disabled={busy} onClick={() => void onSetProfileMods([...profile.modIds, mod.id])}>
                  <Plus className="w-3 h-3" />
                  <span>Add</span>
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
