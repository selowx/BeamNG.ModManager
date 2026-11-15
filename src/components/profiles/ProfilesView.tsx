import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Download, Pencil, Play, Plus, RefreshCw, Share2, Trash2, Undo2, Upload } from 'lucide-react';
import type { LocalMod, ModProfile, ProfileModRef } from '../../types';
import type { useProfileManager } from '../../hooks/useProfileManager';
import { UI_TEXT } from '../../i18n';
import { cn } from '../../utils';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { ApplyProfilePreviewModal } from './ApplyProfilePreviewModal';
import { CreateProfileModal } from './CreateProfileModal';
import { ImportProfileModal } from './ImportProfileModal';
import { ProfileModList } from './ProfileModList';

export interface ProfilesViewProps {
  localMods: LocalMod[];
  gameRunning: boolean;
  manager: ReturnType<typeof useProfileManager>;
  onApplyAndPlay: (profileId: string, keepPinnedOverride?: boolean) => Promise<void>;
}

function formatAppliedDate(ts: number | null): string {
  if (!ts) return 'Never applied';
  const d = new Date(ts > 1e12 ? ts : ts * 1000);
  if (Number.isNaN(d.getTime())) return 'Never applied';
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`;
  return d.toLocaleDateString();
}

export function ProfilesView({ localMods, gameRunning, manager, onApplyAndPlay }: ProfilesViewProps) {
  const t = UI_TEXT;
  const {
    profiles, activeProfileId, hasUndoBackup, activeProfile, activeDrift, busy,
    createProfile, updateProfileMeta, setProfileMods, syncProfileToActive, duplicateProfile,
    deleteProfile, previewApplyProfile, applyProfile, undoLastApply, analyzeImport,
    commitImport, exportProfileJson, downloadMissingMods,
  } = manager;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ModProfile | null>(null);
  const [previewProfile, setPreviewProfile] = useState<ModProfile | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (profiles.length === 0) { setSelectedId(null); return; }
    if (!selectedId || !profiles.some((p) => p.id === selectedId)) {
      setSelectedId(activeProfileId && profiles.some((p) => p.id === activeProfileId) ? activeProfileId : profiles[0].id);
    }
  }, [profiles, activeProfileId, selectedId]);

  useEffect(() => { setConfirmDeleteId(null); }, [selectedId]);

  const localIdSet = useMemo(() => new Set(localMods.map((m) => m.id)), [localMods]);
  const selectedProfile = useMemo(() => profiles.find((p) => p.id === selectedId) ?? null, [profiles, selectedId]);
  const isAlreadyActive = selectedProfile ? selectedProfile.id === activeProfileId && !activeDrift.hasDrift : false;

  const missingStats = useMemo(() => {
    if (!selectedProfile) return { downloadable: [] as ProfileModRef[], externalCount: 0, total: 0 };
    const downloadable: ProfileModRef[] = [];
    let externalCount = 0;
    for (const modId of selectedProfile.modIds) {
      if (localIdSet.has(modId)) continue;
      const ref = selectedProfile.modRefs[modId];
      if (ref?.resourceId && ref.resourceId > 0 && ref.slug) downloadable.push(ref);
      else externalCount += 1;
    }
    return { downloadable, externalCount, total: downloadable.length + externalCount };
  }, [localIdSet, selectedProfile]);

  const handleDuplicate = async (profile: ModProfile) => {
    const dup = await duplicateProfile(profile.id, `${profile.name} Copy`);
    if (dup) setSelectedId(dup.id);
  };

  const handleDelete = async (profile: ModProfile) => {
    if (confirmDeleteId !== profile.id) { setConfirmDeleteId(profile.id); return; }
    if (await deleteProfile(profile.id)) setConfirmDeleteId(null);
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-[#161922]">
      <aside className="w-64 bg-[#1c202a] border-r border-[#323949] flex flex-col gap-2.5 p-3 shrink-0">
        <div className="flex items-center justify-between gap-1.5">
          <h2 className="flex items-center gap-2 text-sm uppercase italic font-bold tracking-wide text-white px-1 shrink-0">
            <span className="inline-block w-2 h-4 bg-[#ff6600] -skew-x-[18deg] shrink-0" />
            <span>{t.tabProfiles}</span>
          </h2>
          <div className="flex items-center gap-1">
            <Button size="xs" onClick={() => { setEditingProfile(null); setCreateOpen(true); }}><Plus className="w-3 h-3" />New</Button>
            <Button variant="secondary" size="xs" onClick={() => setImportOpen(true)}><Upload className="w-3 h-3" />{t.importProfileModalBtn}</Button>
          </div>
        </div>

        <div className="bg-[#222733] border border-[#323949] rounded-sm p-2.5 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-zinc-400 uppercase tracking-wider font-semibold">{t.activePackLabel}</span>
            {activeProfile && activeDrift.hasDrift && (
              <span className="font-mono tabular-nums text-[#ff6600] font-semibold">+{activeDrift.addedIds.length} / -{activeDrift.removedIds.length}</span>
            )}
          </div>
          <div className="text-xs font-semibold text-white truncate">{activeProfile ? activeProfile.name : t.noActivePackLabel}</div>
          <div className="flex flex-col gap-1.5">
            {activeProfile && activeDrift.hasDrift && (
              <Button size="xs" variant="secondary" disabled={busy} onClick={() => void syncProfileToActive(activeProfile.id)}>
                <RefreshCw className="w-3 h-3" />{t.captureActiveModsBtn}
              </Button>
            )}
            {hasUndoBackup && (
              <Button size="xs" variant="outline" disabled={busy || gameRunning} title={gameRunning ? 'Close BeamNG before undoing a switch' : undefined} onClick={() => void undoLastApply()}>
                <Undo2 className="w-3 h-3" />{t.undoSwitchBtn}
              </Button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5">
          {profiles.length === 0 ? (
            <div className="p-3 rounded-sm border border-[#323949] bg-[#222733] text-xs text-zinc-400 text-center">No profiles yet. Create or import a mod pack.</div>
          ) : (
            profiles.map((p) => {
              const isSelected = p.id === selectedId;
              const isActive = p.id === activeProfileId;
              const missingCount = p.modIds.filter((id) => !localIdSet.has(id)).length;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  className={cn(
                    'w-full text-left px-2.5 py-2 rounded-sm border transition-colors cursor-pointer space-y-1',
                    isSelected || isActive ? 'bg-[#282e3c] border-[#3a4254] border-l-2 border-l-[#ff6600]' : 'bg-[#222733] border-[#323949] hover:bg-[#282e3c]',
                  )}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-xs font-semibold text-white truncate">{p.name}</span>
                    {isActive && <Badge variant="default">Active</Badge>}
                  </div>
                  <div className="flex items-center justify-between gap-1 text-[11px] text-zinc-400">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Badge variant="outline" className="capitalize">{p.tag || 'general'}</Badge>
                      <span className="font-mono tabular-nums">{p.modIds.length} mods</span>
                    </div>
                    {missingCount > 0 && <Badge variant="warning" className="font-mono tabular-nums">{missingCount} missing</Badge>}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      <section className="flex-1 flex flex-col overflow-hidden bg-[#161922]">
        {!selectedProfile ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="max-w-sm text-center bg-[#1c202a] border border-[#323949] rounded-sm p-6 space-y-3">
              <div className="text-sm font-semibold text-white">No Profile Selected</div>
              <p className="text-xs text-zinc-400">Save your current active mods as a switchable profile or import a shared JSON pack.</p>
              <div className="flex items-center justify-center gap-2">
                <Button size="sm" onClick={() => { setEditingProfile(null); setCreateOpen(true); }}><Plus className="w-3.5 h-3.5" />{t.newProfileBtn}</Button>
                <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}><Upload className="w-3.5 h-3.5" />{t.importProfileModalBtn}</Button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="bg-[#1c202a] border-b border-[#323949] px-4 py-3 flex flex-wrap items-start justify-between gap-3 shrink-0">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-sm font-bold text-white truncate">{selectedProfile.name}</h1>
                  {selectedProfile.id === activeProfileId && <Badge variant="default">Active</Badge>}
                  <Badge variant="secondary" className="capitalize">{selectedProfile.tag || 'general'}</Badge>
                  <Badge variant="outline">{selectedProfile.pinPolicy === 'strict' ? 'Strict' : 'Keep Protected'}</Badge>
                </div>
                {selectedProfile.description && <p className="text-xs text-zinc-400 truncate max-w-xl">{selectedProfile.description}</p>}
                <div className="text-[11px] text-zinc-400 font-mono tabular-nums">
                  {selectedProfile.modIds.length} mods · Last applied: {formatAppliedDate(selectedProfile.lastAppliedAt)}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                <Button size="sm" disabled={busy || gameRunning || isAlreadyActive} onClick={() => setPreviewProfile(selectedProfile)}>
                  {isAlreadyActive ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Active Profile
                    </>
                  ) : (
                    t.applyProfileBtn
                  )}
                </Button>
                <Button variant="secondary" size="sm" disabled={busy || gameRunning || isAlreadyActive} onClick={() => setPreviewProfile(selectedProfile)}>
                  <Play className="w-3 h-3 fill-current" />{t.applyAndPlayBtn}
                </Button>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => void handleDuplicate(selectedProfile)}>
                  <Copy className="w-3 h-3" />{t.duplicateBtn}
                </Button>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => { setEditingProfile(selectedProfile); setCreateOpen(true); }}>
                  <Pencil className="w-3 h-3" />{t.editInfoBtn}
                </Button>
                <Button variant="outline" size="sm" onClick={() => void exportProfileJson(selectedProfile)}>
                  <Share2 className="w-3 h-3" />Export
                </Button>
                <Button variant={confirmDeleteId === selectedProfile.id ? 'destructive' : 'outline'} size="sm" disabled={busy} onClick={() => void handleDelete(selectedProfile)}>
                  <Trash2 className="w-3 h-3" />{confirmDeleteId === selectedProfile.id ? 'Confirm Delete' : t.deleteBtn}
                </Button>
              </div>
            </div>

            <div className="flex-1 flex flex-col gap-2.5 p-3 min-h-0 overflow-hidden">
              {selectedProfile.id === activeProfileId && activeDrift.hasDrift && (
                <div className="px-3 py-2 rounded-sm bg-[#222733] border border-[#323949] border-l-2 border-l-[#ff6600] flex items-center justify-between gap-2 text-xs shrink-0">
                  <span className="text-zinc-200">
                    Active mods in Installed Mods differ from this profile (<strong className="font-mono tabular-nums text-white">+{activeDrift.addedIds.length}</strong> enabled,{' '}
                    <strong className="font-mono tabular-nums text-white">-{activeDrift.removedIds.length}</strong> disabled).
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button variant="default" size="xs" disabled={busy} onClick={() => setPreviewProfile(selectedProfile)}>{t.applyProfileListBtn}</Button>
                    <Button variant="secondary" size="xs" disabled={busy} onClick={() => void syncProfileToActive(selectedProfile.id)}>{t.captureActiveModsBtn}</Button>
                  </div>
                </div>
              )}

              {missingStats.total > 0 && (
                <div className="px-3 py-2 rounded-sm bg-amber-950/35 border border-amber-700/50 flex items-center justify-between gap-2 text-xs shrink-0">
                  <span className="text-amber-200 font-mono tabular-nums">
                    {missingStats.total} missing mod(s): {missingStats.downloadable.length} Repo Downloadable · {missingStats.externalCount} External ZIP
                  </span>
                  {missingStats.downloadable.length > 0 && (
                    <Button size="xs" disabled={busy} onClick={() => void downloadMissingMods(missingStats.downloadable)}>
                      <Download className="w-3 h-3" />{t.downloadMissingBtn} ({missingStats.downloadable.length})
                    </Button>
                  )}
                </div>
              )}

              <ProfileModList
                profile={selectedProfile}
                localMods={localMods}
                busy={busy}
                onSetProfileMods={(modIds) => setProfileMods(selectedProfile.id, modIds)}
                onQueueDownload={downloadMissingMods}
              />
            </div>
          </>
        )}
      </section>

      <CreateProfileModal
        open={createOpen}
        editingProfile={editingProfile}
        existingProfiles={profiles}
        busy={busy}
        onClose={() => { setCreateOpen(false); setEditingProfile(null); }}
        onCreate={async (input) => { const c = await createProfile(input); if (c) setSelectedId(c.id); return c; }}
        onUpdate={updateProfileMeta}
      />

      <ApplyProfilePreviewModal
        profile={previewProfile}
        gameRunning={gameRunning}
        busy={busy}
        onClose={() => setPreviewProfile(null)}
        onFetchPreview={previewApplyProfile}
        onApply={applyProfile}
        onApplyAndPlay={onApplyAndPlay}
      />

      <ImportProfileModal
        open={importOpen}
        existingProfileNames={profiles.map((p) => p.name)}
        busy={busy}
        onClose={() => setImportOpen(false)}
        onAnalyze={analyzeImport}
        onCommit={async (input) => { const c = await commitImport(input); if (c) setSelectedId(c.id); return c; }}
        onDownloadMissing={downloadMissingMods}
      />
    </div>
  );
}
