import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { ModProfile } from '../../types';
import { cn } from '../../utils';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { SelectDropdown } from '../ui/select';

const PROFILE_TAGS = ['general', 'career', 'multiplayer', 'drift', 'offroad', 'minimal'] as const;

export interface CreateProfileModalProps {
  open: boolean;
  editingProfile: ModProfile | null;
  existingProfiles: ModProfile[];
  busy: boolean;
  onClose: () => void;
  onCreate: (input: {
    name: string;
    description: string;
    tag: string;
    pinPolicy: 'keep_pinned' | 'strict';
    sourceMode: 'active' | 'empty' | 'copy';
    sourceProfileId?: string | null;
  }) => Promise<unknown>;
  onUpdate: (profileId: string, name: string, description: string, tag: string, pinPolicy: 'keep_pinned' | 'strict') => Promise<unknown>;
}

export function CreateProfileModal({ open, editingProfile, existingProfiles, busy, onClose, onCreate, onUpdate }: CreateProfileModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tag, setTag] = useState('general');
  const [pinPolicy, setPinPolicy] = useState<'keep_pinned' | 'strict'>('keep_pinned');
  const [sourceMode, setSourceMode] = useState<'active' | 'empty' | 'copy'>('active');
  const [sourceProfileId, setSourceProfileId] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(editingProfile?.name ?? '');
    setDescription(editingProfile?.description ?? '');
    setTag(editingProfile?.tag || 'general');
    setPinPolicy(editingProfile?.pinPolicy === 'strict' ? 'strict' : 'keep_pinned');
    setSourceMode('active');
    setSourceProfileId(existingProfiles[0]?.id ?? '');
  }, [open, editingProfile, existingProfiles]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0 && (editingProfile || sourceMode !== 'copy' || Boolean(sourceProfileId));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || busy) return;
    const res = editingProfile
      ? await onUpdate(editingProfile.id, trimmedName, description.trim(), tag, pinPolicy)
      : await onCreate({
          name: trimmedName,
          description: description.trim(),
          tag,
          pinPolicy,
          sourceMode,
          sourceProfileId: sourceMode === 'copy' ? sourceProfileId : null,
        });
    if (res) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <form onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-[#1c202a] border border-[#323949] rounded-sm">
        <div className="px-4 py-2.5 bg-[#161922] border-b border-[#323949] rounded-t-sm flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white">{editingProfile ? 'Edit Profile Info' : 'Create New Profile'}</h3>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="Close"><X className="w-4 h-4" /></Button>
        </div>

        <div className="p-4 space-y-3 text-xs">
          <div className="space-y-1">
            <label className="block text-zinc-300 font-semibold">Profile Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Career Realism" autoFocus />
          </div>

          <div className="space-y-1">
            <label className="block text-zinc-300 font-semibold">Tag</label>
            <div className="flex flex-wrap gap-1.5">
              {PROFILE_TAGS.map((t) => (
                <button key={t} type="button" onClick={() => setTag(t)} className={cn('px-2 py-1 rounded-sm border text-[11px] font-semibold capitalize cursor-pointer transition-colors', tag === t ? 'bg-[#ff6600] border-[#ff6600] text-white' : 'bg-[#222733] border-[#323949] text-zinc-300 hover:bg-[#282e3c]')}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-zinc-300 font-semibold">Description (optional)</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short note about this mod pack..." />
          </div>

          {!editingProfile && (
            <div className="space-y-1.5">
              <label className="block text-zinc-300 font-semibold">Initial Mod Set</label>
              <div className="grid grid-cols-3 gap-1.5">
                {([{ id: 'active', label: 'Current Active' }, { id: 'empty', label: 'Empty Pack' }, { id: 'copy', label: 'Copy Existing' }] as const).map((opt) => (
                  <button key={opt.id} type="button" disabled={opt.id === 'copy' && existingProfiles.length === 0} onClick={() => setSourceMode(opt.id)} className={cn('px-2 py-1.5 rounded-sm border text-[11px] font-semibold cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed', sourceMode === opt.id ? 'bg-[#282e3c] border-[#ff6600] text-white' : 'bg-[#222733] border-[#323949] text-zinc-300 hover:bg-[#282e3c]')}>
                    {opt.label}
                  </button>
                ))}
              </div>
              {sourceMode === 'copy' && existingProfiles.length > 0 && (
                <SelectDropdown
                  value={sourceProfileId}
                  options={existingProfiles.map((p) => ({ value: p.id, label: `${p.name} (${p.modIds.length} mods)` }))}
                  onChange={(v) => setSourceProfileId(String(v))}
                  size="sm"
                  className="w-full"
                  triggerClassName="w-full font-sans"
                />
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-zinc-300 font-semibold">Protected (Pinned) Mod Policy</label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { id: 'keep_pinned', title: 'Keep Protected', desc: 'Pinned mods stay active on switch' },
                { id: 'strict', title: 'Strict', desc: 'Disable all non-profile mods' },
              ] as const).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setPinPolicy(opt.id)}
                  className={cn(
                    'text-left p-2 rounded-sm border cursor-pointer transition-colors',
                    pinPolicy === opt.id ? 'bg-[#282e3c] border-[#ff6600] text-white' : 'bg-[#222733] border-[#323949] text-zinc-300 hover:bg-[#282e3c]',
                  )}
                >
                  <div className="font-semibold text-xs">{opt.title}</div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="px-4 py-2.5 bg-[#161922] border-t border-[#323949] rounded-b-sm flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm" disabled={!canSubmit || busy}>{editingProfile ? 'Save Changes' : 'Create Profile'}</Button>
        </div>
      </form>
    </div>
  );
}
