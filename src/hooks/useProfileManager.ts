import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import type { EnqueueDownloadInput, LocalMod, ModProfile, ProfileModRef, ProfilesState } from '../types';

export interface ActiveProfileDrift {
  addedIds: string[];
  removedIds: string[];
  hasDrift: boolean;
}

export interface UseProfileManagerParams {
  localMods: LocalMod[];
  onQueueMissingDownloads: (items: EnqueueDownloadInput[]) => Promise<void>;
  refreshConfigAndLocal: () => Promise<unknown>;
  notify: (type: 'success' | 'error' | 'info', msg: string) => void;
}

const EMPTY_STATE: ProfilesState = { profiles: [], activeProfileId: null, hasUndoBackup: false };

export function useProfileManager({ localMods, onQueueMissingDownloads, refreshConfigAndLocal, notify }: UseProfileManagerParams) {
  const [state, setState] = useState<ProfilesState>(EMPTY_STATE);
  const [busy, setBusy] = useState(false);

  const reloadProfiles = useCallback(async () => {
    try {
      const next = await api.getProfilesState();
      setState(next);
      return next;
    } catch (err) {
      notify('error', `Failed to load profiles: ${String(err)}`);
      return null;
    }
  }, [notify]);

  useEffect(() => { void reloadProfiles(); }, [reloadProfiles]);

  const activeProfile = useMemo(
    () => state.profiles.find((p) => p.id === state.activeProfileId) ?? null,
    [state.profiles, state.activeProfileId],
  );

  const activeDrift = useMemo<ActiveProfileDrift>(() => {
    if (!activeProfile) return { addedIds: [], removedIds: [], hasDrift: false };
    const activeLocalIds = localMods.filter((m) => m.active).map((m) => m.id);
    const profileSet = new Set(activeProfile.modIds);
    const activeSet = new Set(activeLocalIds);
    const addedIds = activeLocalIds.filter((id) => !profileSet.has(id));
    const removedIds = activeProfile.modIds.filter((id) => !activeSet.has(id));
    return { addedIds, removedIds, hasDrift: addedIds.length > 0 || removedIds.length > 0 };
  }, [activeProfile, localMods]);

  const runAction = useCallback(async <T>(fn: () => Promise<T>, errorPrefix: string): Promise<T | null> => {
    setBusy(true);
    try { return await fn(); }
    catch (err) { notify('error', `${errorPrefix}: ${String(err)}`); return null; }
    finally { setBusy(false); }
  }, [notify]);

  const createProfile = useCallback(
    (input: Parameters<typeof api.createProfileV2>[0]) =>
      runAction(async () => {
        const created = await api.createProfileV2(input);
        await reloadProfiles();
        notify('success', `Profile "${created.name}" created.`);
        return created;
      }, 'Failed to create profile'),
    [notify, reloadProfiles, runAction],
  );

  const updateProfileMeta = useCallback(
    (id: string, name: string, desc: string, tag: string, pinPolicy: 'keep_pinned' | 'strict') =>
      runAction(async () => {
        const updated = await api.updateProfileMeta(id, name, desc, tag, pinPolicy);
        await reloadProfiles();
        notify('success', `Profile "${updated.name}" updated.`);
        return updated;
      }, 'Failed to update profile'),
    [notify, reloadProfiles, runAction],
  );

  const setProfileMods = useCallback(
    (profileId: string, modIds: string[]) =>
      runAction(async () => {
        const u = await api.setProfileMods(profileId, modIds);
        await Promise.all([refreshConfigAndLocal(), reloadProfiles()]);
        notify('success', `Updated mod list for "${u.name}".`);
        return u;
      }, 'Failed to update profile mods'),
    [notify, refreshConfigAndLocal, reloadProfiles, runAction],
  );

  const syncProfileToActive = useCallback(
    (profileId: string) =>
      runAction(async () => {
        const u = await api.syncProfileToActive(profileId);
        await reloadProfiles();
        notify('success', `Synced "${u.name}" to currently active mods.`);
        return u;
      }, 'Failed to sync profile'),
    [notify, reloadProfiles, runAction],
  );

  const duplicateProfile = useCallback(
    (profileId: string, newName: string) =>
      runAction(async () => {
        const dup = await api.duplicateProfile(profileId, newName);
        await reloadProfiles();
        notify('success', `Duplicated profile as "${dup.name}".`);
        return dup;
      }, 'Failed to duplicate profile'),
    [notify, reloadProfiles, runAction],
  );

  const deleteProfile = useCallback(
    (profileId: string) =>
      runAction(async () => {
        await api.deleteProfile(profileId);
        await reloadProfiles();
        notify('info', 'Profile deleted.');
        return true;
      }, 'Failed to delete profile'),
    [notify, reloadProfiles, runAction],
  );

  const previewApplyProfile = useCallback(
    async (profileId: string, keepPinnedOverride?: boolean) => {
      try { return await api.previewApplyProfile(profileId, keepPinnedOverride); }
      catch (err) { notify('error', `Failed to preview profile: ${String(err)}`); return null; }
    },
    [notify],
  );

  const applyProfile = useCallback(
    (profileId: string, keepPinnedOverride?: boolean) =>
      runAction(async () => {
        const res = await api.applyProfileV2(profileId, keepPinnedOverride);
        await Promise.all([refreshConfigAndLocal(), reloadProfiles()]);
        notify('success', `Profile applied (${res.changedCount} mod state changes).`);
        return res;
      }, 'Failed to apply profile'),
    [notify, refreshConfigAndLocal, reloadProfiles, runAction],
  );

  const undoLastApply = useCallback(
    () =>
      runAction(async () => {
        const res = await api.undoLastProfileApply();
        await Promise.all([refreshConfigAndLocal(), reloadProfiles()]);
        notify('success', `Restored previous mod state (${res.changedCount} changes).`);
        return res;
      }, 'Failed to undo profile switch'),
    [notify, refreshConfigAndLocal, reloadProfiles, runAction],
  );

  const analyzeImport = useCallback(
    async (rawJson: string) => {
      try { return await api.analyzeProfileImport(rawJson); }
      catch (err) { notify('error', `Invalid profile JSON: ${String(err)}`); return null; }
    },
    [notify],
  );

  const commitImport = useCallback(
    (input: Parameters<typeof api.commitImportedProfile>[0]) =>
      runAction(async () => {
        const created = await api.commitImportedProfile(input);
        await reloadProfiles();
        notify('success', `Imported profile "${created.name}".`);
        return created;
      }, 'Failed to import profile'),
    [notify, reloadProfiles, runAction],
  );

  const exportProfileJson = useCallback(async (profile: ModProfile): Promise<boolean> => {
    const { name, description, tag, pinPolicy, modIds, modRefs } = profile;
    const payload = JSON.stringify({ name, description, tag, pinPolicy, modIds, modRefs }, null, 2);
    try { await api.writeClipboardText(payload); notify('success', `Copied "${profile.name}" JSON to clipboard.`); return true; }
    catch (err) { notify('error', `Failed to copy profile JSON: ${String(err)}`); return false; }
  }, [notify]);

  const downloadMissingMods = useCallback(async (refs: ProfileModRef[]): Promise<number> => {
    const seen = new Set<number>();
    const items: EnqueueDownloadInput[] = [];
    for (const ref of refs) {
      if (ref.resourceId && ref.resourceId > 0 && ref.slug && !seen.has(ref.resourceId)) {
        seen.add(ref.resourceId);
        items.push({ resourceId: ref.resourceId, slug: ref.slug, title: ref.title || ref.filename });
      }
    }
    if (items.length === 0) { notify('info', 'No repo-downloadable missing mods found.'); return 0; }
    try { await onQueueMissingDownloads(items); notify('success', `Queued ${items.length} missing mod download(s).`); return items.length; }
    catch (err) { notify('error', `Failed to queue downloads: ${String(err)}`); return 0; }
  }, [notify, onQueueMissingDownloads]);

  return {
    profiles: state.profiles, activeProfileId: state.activeProfileId, hasUndoBackup: state.hasUndoBackup,
    activeProfile, activeDrift, busy, reloadProfiles, createProfile, updateProfileMeta, setProfileMods,
    syncProfileToActive, duplicateProfile, deleteProfile, previewApplyProfile, applyProfile,
    undoLastApply, analyzeImport, commitImport, exportProfileJson, downloadMissingMods,
  };
}
