import { useEffect, useState } from 'react';
import { AlertTriangle, Play, X } from 'lucide-react';
import type { ModProfile, ProfileApplyPreview, ProfileModRef } from '../../types';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';

export interface ApplyProfilePreviewModalProps {
  profile: ModProfile | null;
  gameRunning: boolean;
  busy: boolean;
  onClose: () => void;
  onFetchPreview: (profileId: string, keepPinnedOverride?: boolean) => Promise<ProfileApplyPreview | null>;
  onApply: (profileId: string, keepPinnedOverride?: boolean) => Promise<unknown>;
  onApplyAndPlay: (profileId: string, keepPinnedOverride?: boolean) => Promise<void>;
}

function PreviewGroup({ title, items, emptyText }: { title: string; items: ProfileModRef[]; emptyText: string }) {
  return (
    <div className="bg-[#161922] border border-[#323949] rounded-sm p-2 space-y-1">
      <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-300">
        <span>{title}</span>
        <span className="font-mono tabular-nums text-zinc-400">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div className="text-[11px] text-zinc-500">{emptyText}</div>
      ) : (
        <div className="max-h-20 overflow-y-auto space-y-0.5 text-[11px] text-zinc-300 font-mono">
          {items.map((item) => (
            <div key={item.modId} className="truncate">
              {item.title || item.filename}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ApplyProfilePreviewModal({
  profile,
  gameRunning,
  busy,
  onClose,
  onFetchPreview,
  onApply,
  onApplyAndPlay,
}: ApplyProfilePreviewModalProps) {
  const [keepPinned, setKeepPinned] = useState(true);
  const [preview, setPreview] = useState<ProfileApplyPreview | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!profile) {
      setPreview(null);
      return;
    }
    setKeepPinned(profile.pinPolicy !== 'strict');
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    setLoading(true);
    void onFetchPreview(profile.id, keepPinned).then((res) => {
      if (!cancelled) {
        setPreview(res);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [profile, keepPinned, onFetchPreview]);

  useEffect(() => {
    if (!profile) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [profile, onClose]);

  if (!profile) return null;

  const missingRefs = preview ? [...preview.missingDownloadable, ...preview.missingManual] : [];
  const isBlockedByGame = Boolean(preview?.gameRunning || gameRunning);
  const actionsDisabled = busy || loading || !preview || isBlockedByGame;

  const handleApplyOnly = async () => {
    if (actionsDisabled) return;
    const res = await onApply(profile.id, keepPinned);
    if (res) onClose();
  };

  const handleApplyPlay = async () => {
    if (actionsDisabled) return;
    await onApplyAndPlay(profile.id, keepPinned);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-[#1c202a] border border-[#323949] rounded-sm overflow-hidden"
      >
        <div className="px-4 py-2.5 bg-[#161922] border-b border-[#323949] flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white truncate">
            Apply Profile: {profile.name}
          </h3>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="Close">
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="p-4 space-y-3 text-xs">
          {isBlockedByGame && (
            <div className="px-3 py-2 rounded-sm bg-red-950/40 border border-red-800/60 text-red-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>BeamNG.drive is currently running. Close the game before switching profiles.</span>
            </div>
          )}

          <div className="grid grid-cols-4 gap-2 text-center font-mono tabular-nums">
            <div className="p-2 rounded-sm bg-emerald-950/40 border border-emerald-800/50 text-emerald-300">
              <div className="text-sm font-bold">+{preview?.toEnable.length ?? 0}</div>
              <div className="text-[11px] uppercase">To Enable</div>
            </div>
            <div className="p-2 rounded-sm bg-red-950/40 border border-red-800/50 text-red-300">
              <div className="text-sm font-bold">-{preview?.toDisable.length ?? 0}</div>
              <div className="text-[11px] uppercase">To Disable</div>
            </div>
            <div className="p-2 rounded-sm bg-[#222733] border border-[#323949] text-zinc-200">
              <div className="text-sm font-bold">{preview?.keptPinned.length ?? 0}</div>
              <div className="text-[11px] uppercase">Pinned Kept</div>
            </div>
            <div className="p-2 rounded-sm bg-amber-950/40 border border-amber-800/50 text-amber-300">
              <div className="text-sm font-bold">{missingRefs.length}</div>
              <div className="text-[11px] uppercase">Missing</div>
            </div>
          </div>

          {loading ? (
            <div className="p-4 rounded-sm bg-[#161922] border border-[#323949] text-center text-zinc-400 animate-pulse">
              Calculating profile diff...
            </div>
          ) : preview ? (
            <div className="grid grid-cols-2 gap-2">
              <PreviewGroup title="+ To Enable" items={preview.toEnable} emptyText="None" />
              <PreviewGroup title="- To Disable" items={preview.toDisable} emptyText="None" />
              <PreviewGroup title="Pinned Kept" items={preview.keptPinned} emptyText="None" />
              <PreviewGroup title="Missing on Disk" items={missingRefs} emptyText="All mods present" />
            </div>
          ) : null}

          <div className="flex items-center justify-between p-2.5 rounded-sm bg-[#161922] border border-[#323949]">
            <span className="text-zinc-200 font-medium">Keep protected (pinned) mods enabled</span>
            <Switch checked={keepPinned} onCheckedChange={setKeepPinned} disabled={busy} />
          </div>
        </div>

        <div className="px-4 py-2.5 bg-[#161922] border-t border-[#323949] flex items-center justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="secondary" size="sm" disabled={actionsDisabled} onClick={() => void handleApplyOnly()}>
            Apply Profile
          </Button>
          <Button type="button" size="sm" disabled={actionsDisabled} onClick={() => void handleApplyPlay()}>
            <Play className="w-3 h-3 fill-current" />
            Apply &amp; Play
          </Button>
        </div>
      </div>
    </div>
  );
}
