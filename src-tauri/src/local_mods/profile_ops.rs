use super::ops::{bulk_set_mods_active, bulk_set_mods_active_with_policy};
use super::profiles::{
    build_profile, hydrate_mod_refs_with_locals, normalize_mod_ids, normalize_pin_policy,
    normalize_tag, now_unix,
};
use super::scanner::prettify_mod_name;
use crate::beamng_env::{is_game_running, load_manager_state, save_manager_state};
use crate::models::{
    ApplyProfileResult, BeamNGConfig, LocalMod, ManagerStateFile, ModProfile,
    PreviousProfileBackup, ProfileApplyPreview, ProfileImportAnalysis, ProfileModRef,
};
use serde::Deserialize;
use std::collections::{HashMap, HashSet};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawImportProfile {
    #[serde(default)] name: String,
    #[serde(default)] description: String,
    #[serde(default)] tag: String,
    #[serde(default, alias = "mod_ids")] mod_ids: Vec<String>,
    #[serde(default, alias = "mod_refs")] mod_refs: HashMap<String, ProfileModRef>,
    #[serde(default, alias = "pin_policy")] pin_policy: String,
}

fn normalize_refs_map(raw: HashMap<String, ProfileModRef>) -> HashMap<String, ProfileModRef> {
    raw.into_iter().map(|(k, mut v)| {
        let key = k.trim().to_lowercase();
        v.mod_id = if v.mod_id.trim().is_empty() { key.clone() } else { v.mod_id.trim().to_lowercase() };
        (key, v)
    }).collect()
}

fn fallback_mod_ref(state: &ManagerStateFile, prior_refs: &HashMap<String, ProfileModRef>, id: &str) -> ProfileModRef {
    if let Some(prev) = prior_refs.get(id) {
        let mut r = prev.clone();
        if r.mod_id.trim().is_empty() { r.mod_id = id.to_string(); }
        return r;
    }
    if let Some(meta) = state.cached_metadata.get(id) {
        return ProfileModRef {
            mod_id: id.to_string(), title: meta.title.clone(), filename: format!("{}.zip", id),
            author: meta.author.clone(), resource_id: meta.resource_id, tag_id: meta.tag_id.clone(),
            slug: meta.resource_id.map(|rid| format!("resources/{}/", rid)), size_bytes: meta.size_bytes.unwrap_or(0),
        };
    }
    ProfileModRef { mod_id: id.to_string(), title: prettify_mod_name(id), filename: format!("{}.zip", id), ..Default::default() }
}

fn build_apply_preview(
    state: &ManagerStateFile, profile: &ModProfile, local_mods: &[LocalMod],
    keep_pinned_override: Option<bool>, game_running: bool,
) -> (ProfileApplyPreview, bool) {
    let keep_pinned = keep_pinned_override.unwrap_or(profile.pin_policy != "strict");
    let target_ids = normalize_mod_ids(profile.mod_ids.clone());
    let target_set: HashSet<String> = target_ids.iter().cloned().collect();
    let installed_ids: HashSet<String> = local_mods.iter().map(|m| m.id.to_lowercase()).collect();
    let (mut to_enable, mut to_disable, mut kept_pinned) = (Vec::new(), Vec::new(), Vec::new());
    let mut already_active_count = 0usize;

    for m in local_mods {
        let id = m.id.to_lowercase();
        if m.location == "staging" { continue; }
        if m.location == "unpacked" {
            if target_set.contains(&id) { already_active_count += 1; }
            continue;
        }
        if target_set.contains(&id) {
            if m.active { already_active_count += 1; } else { to_enable.push(ProfileModRef::from_local_mod(m)); }
        } else if m.active {
            if m.pinned && keep_pinned { kept_pinned.push(ProfileModRef::from_local_mod(m)); }
            else { to_disable.push(ProfileModRef::from_local_mod(m)); }
        }
    }

    let (mut missing_downloadable, mut missing_manual) = (Vec::new(), Vec::new());
    for id in target_ids {
        if !installed_ids.contains(&id) {
            let r = fallback_mod_ref(state, &profile.mod_refs, &id);
            if r.is_downloadable() { missing_downloadable.push(r); } else { missing_manual.push(r); }
        }
    }
    (ProfileApplyPreview {
        profile_id: profile.id.clone(), profile_name: profile.name.clone(), pin_policy: profile.pin_policy.clone(),
        to_enable, to_disable, kept_pinned, missing_downloadable, missing_manual, already_active_count, game_running,
    }, keep_pinned)
}

pub fn preview_apply_profile(
    config: &BeamNGConfig, profile_id: &str, keep_pinned_override: Option<bool>,
) -> Result<ProfileApplyPreview, String> {
    let state = load_manager_state(&config.user_path);
    let profile = state.profiles.iter().find(|p| p.id == profile_id).ok_or_else(|| "Mod profile not found.".to_string())?;
    let local_mods = super::list_local_mods(config)?;
    Ok(build_apply_preview(&state, profile, &local_mods, keep_pinned_override, is_game_running()).0)
}

pub fn apply_profile_v2(
    config: &BeamNGConfig, profile_id: &str, keep_pinned_override: Option<bool>,
) -> Result<ApplyProfileResult, String> {
    if is_game_running() {
        return Err("Cannot switch profiles while BeamNG.drive is running. Close the game first to avoid locked mod files.".into());
    }
    let mut state = load_manager_state(&config.user_path);
    let profile = state.profiles.iter().find(|p| p.id == profile_id).cloned()
        .ok_or_else(|| "Mod profile not found.".to_string())?;
    let local_mods = super::list_local_mods(config)?;
    let (preview, keep_pinned) = build_apply_preview(&state, &profile, &local_mods, keep_pinned_override, false);
    if state.active_profile_id.as_deref() == Some(profile_id)
        && preview.to_enable.is_empty()
        && preview.to_disable.is_empty()
    {
        return Ok(ApplyProfileResult {
            changed_count: 0,
            active_profile_id: state.active_profile_id,
            has_undo_backup: state.previous_profile_backup.is_some(),
        });
    }

    let active_mod_ids: Vec<String> = local_mods.iter()
        .filter(|m| m.active && m.location != "unpacked" && m.location != "staging")
        .map(|m| m.id.to_lowercase()).collect();
    let now = now_unix().0;
    state.previous_profile_backup = Some(PreviousProfileBackup {
        previous_active_profile_id: state.active_profile_id.clone(), active_mod_ids, saved_at: now,
    });
    save_manager_state(&config.user_path, &state)?;

    let enable_ids: Vec<String> = preview.to_enable.iter().map(|r| r.mod_id.clone()).collect();
    let disable_ids: Vec<String> = preview.to_disable.iter().map(|r| r.mod_id.clone()).collect();
    let en = if enable_ids.is_empty() { 0 } else { bulk_set_mods_active(config, &enable_ids, true)? };
    let dis = if disable_ids.is_empty() { 0 } else { bulk_set_mods_active_with_policy(config, &disable_ids, false, !keep_pinned)? };

    let mut state = load_manager_state(&config.user_path);
    state.active_profile_id = Some(profile_id.to_string());
    if let Some(p) = state.profiles.iter_mut().find(|p| p.id == profile_id) { p.last_applied_at = Some(now); }
    save_manager_state(&config.user_path, &state)?;
    super::invalidate_local_mods_cache();

    Ok(ApplyProfileResult {
        changed_count: en + dis, active_profile_id: state.active_profile_id,
        has_undo_backup: state.previous_profile_backup.is_some(),
    })
}

pub fn undo_last_profile_apply(config: &BeamNGConfig) -> Result<ApplyProfileResult, String> {
    if is_game_running() {
        return Err("Cannot undo profile switch while BeamNG.drive is running. Close the game first to avoid locked mod files.".into());
    }
    let state = load_manager_state(&config.user_path);
    let backup = state.previous_profile_backup.clone()
        .ok_or_else(|| "No previous profile state is available to undo.".to_string())?;
    let target_set: HashSet<String> = backup.active_mod_ids.iter().map(|s| s.to_lowercase()).collect();
    let local_mods = super::list_local_mods(config)?;

    let to_enable: Vec<String> = local_mods.iter()
        .filter(|m| !m.active && m.location != "unpacked" && m.location != "staging" && target_set.contains(&m.id.to_lowercase()))
        .map(|m| m.id.clone()).collect();
    let to_disable: Vec<String> = local_mods.iter()
        .filter(|m| m.active && !m.pinned && m.location != "unpacked" && m.location != "staging" && !target_set.contains(&m.id.to_lowercase()))
        .map(|m| m.id.clone()).collect();

    let en = if to_enable.is_empty() { 0 } else { bulk_set_mods_active(config, &to_enable, true)? };
    let dis = if to_disable.is_empty() { 0 } else { bulk_set_mods_active(config, &to_disable, false)? };

    let mut state = load_manager_state(&config.user_path);
    state.active_profile_id = backup.previous_active_profile_id;
    state.previous_profile_backup = None;
    save_manager_state(&config.user_path, &state)?;
    super::invalidate_local_mods_cache();

    Ok(ApplyProfileResult { changed_count: en + dis, active_profile_id: state.active_profile_id, has_undo_backup: false })
}

pub fn analyze_profile_import(config: &BeamNGConfig, raw_json: &str) -> Result<ProfileImportAnalysis, String> {
    let parsed: RawImportProfile = serde_json::from_str(raw_json).map_err(|e| format!("Invalid profile JSON: {}", e))?;
    let trimmed_name = parsed.name.trim().to_string();
    if trimmed_name.is_empty() { return Err("Imported profile JSON is missing a valid profile name.".into()); }

    let mod_ids = normalize_mod_ids(parsed.mod_ids);
    let prior_refs = normalize_refs_map(parsed.mod_refs);
    let state = load_manager_state(&config.user_path);
    let local_mods = super::list_local_mods(config)?;
    let local_set: HashSet<String> = local_mods.iter().map(|m| m.id.to_lowercase()).collect();
    let mut mod_refs = hydrate_mod_refs_with_locals(&local_mods, &state, &mod_ids, &prior_refs);

    let (mut installed_count, mut missing_downloadable, mut missing_manual) = (0usize, Vec::new(), Vec::new());
    for id in &mod_ids {
        if local_set.contains(id) {
            installed_count += 1;
        } else {
            let r = fallback_mod_ref(&state, &prior_refs, id);
            mod_refs.entry(id.clone()).or_insert_with(|| r.clone());
            if r.is_downloadable() { missing_downloadable.push(r); } else { missing_manual.push(r); }
        }
    }
    let duplicate_name_exists = state.profiles.iter().any(|p| p.name.eq_ignore_ascii_case(&trimmed_name));
    Ok(ProfileImportAnalysis {
        name: trimmed_name, description: parsed.description.trim().to_string(),
        tag: normalize_tag(&parsed.tag), pin_policy: normalize_pin_policy(&parsed.pin_policy),
        mod_ids, mod_refs, installed_count, missing_downloadable, missing_manual, duplicate_name_exists,
    })
}

pub fn commit_imported_profile(
    config: &BeamNGConfig, name: &str, description: &str, tag: &str, pin_policy: &str,
    mod_ids: Vec<String>, mod_refs: HashMap<String, ProfileModRef>,
) -> Result<ModProfile, String> {
    let trimmed_name = name.trim().to_string();
    if trimmed_name.is_empty() { return Err("Profile name cannot be empty.".into()); }
    let norm_ids = normalize_mod_ids(mod_ids);
    let norm_refs = normalize_refs_map(mod_refs);
    let mut state = load_manager_state(&config.user_path);
    let local_mods = super::list_local_mods(config)?;
    let hydrated = hydrate_mod_refs_with_locals(&local_mods, &state, &norm_ids, &norm_refs);
    let profile = build_profile(trimmed_name, description, tag, pin_policy, norm_ids, hydrated);
    state.profiles.push(profile.clone());
    save_manager_state(&config.user_path, &state)?;
    Ok(profile)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn make_temp_config(name: &str) -> (PathBuf, BeamNGConfig) {
        let root = std::env::temp_dir().join(format!("beamng_prof_test_{}_{}", name, now_unix().1));
        let (mods, repo, disabled, staging) = (root.join("mods"), root.join("mods").join("repo"), root.join("mods_disabled"), root.join("mods_staging"));
        for d in [&root, &mods, &repo, &disabled, &staging] { let _ = fs::create_dir_all(d); }
        let cfg = BeamNGConfig {
            version: "0.40".into(), install_path: root.to_string_lossy().into(), user_path: root.to_string_lossy().into(),
            mods_path: mods.to_string_lossy().into(), repo_path: repo.to_string_lossy().into(),
            disabled_path: disabled.to_string_lossy().into(), staging_path: staging.to_string_lossy().into(),
            db_json_path: mods.join("db.json").to_string_lossy().into(), game_running: false, staged_count: 0,
        };
        (root, cfg)
    }

    #[test]
    fn legacy_v1_profile_json_deserializes_with_v2_defaults() {
        let v1 = r#"{"id":"pack_1","name":"Career","modIds":["mod_a"],"createdAt":12345}"#;
        let p: ModProfile = serde_json::from_str(v1).expect("parse v1");
        assert_eq!((p.name.as_str(), p.tag.as_str(), p.pin_policy.as_str(), p.updated_at, p.last_applied_at), ("Career", "general", "keep_pinned", 0, None));
        assert!(p.description.is_empty() && p.mod_refs.is_empty());
    }

    #[test]
    fn preview_diff_computes_enable_disable_pinned_and_missing() {
        let (root, cfg) = make_temp_config("preview");
        for f in ["active_keep.zip", "active_drop.zip", "pinned_ext.zip"] { let _ = fs::write(PathBuf::from(&cfg.repo_path).join(f), b"zip"); }
        let _ = fs::write(PathBuf::from(&cfg.disabled_path).join("enable_me.zip"), b"zip");
        let mut mod_refs = HashMap::new();
        mod_refs.insert("missing_repo".into(), ProfileModRef { mod_id: "missing_repo".into(), resource_id: Some(999), ..Default::default() });
        let profile = ModProfile {
            id: "p1".into(), name: "Test".into(), mod_ids: vec!["active_keep".into(), "enable_me".into(), "missing_repo".into(), "missing_manual".into()],
            mod_refs, pin_policy: "keep_pinned".into(), ..Default::default()
        };
        save_manager_state(&cfg.user_path, &ManagerStateFile { pinned_mods: vec!["pinned_ext".into()], profiles: vec![profile], ..Default::default() }).expect("save");
        let keep = preview_apply_profile(&cfg, "p1", None).expect("preview");
        assert_eq!((keep.already_active_count, keep.to_enable.len(), keep.to_disable.len(), keep.kept_pinned.len(), keep.missing_downloadable.len(), keep.missing_manual.len()), (1, 1, 1, 1, 1, 1));
        let strict = preview_apply_profile(&cfg, "p1", Some(false)).expect("strict");
        assert_eq!((strict.kept_pinned.len(), strict.to_disable.len()), (0, 2));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn import_analysis_classifies_missing_repo_vs_manual() {
        let (root, cfg) = make_temp_config("import");
        let _ = fs::write(PathBuf::from(&cfg.repo_path).join("installed_mod.zip"), b"zip");
        save_manager_state(&cfg.user_path, &ManagerStateFile { profiles: vec![ModProfile { id: "p0".into(), name: "Drift Pack".into(), ..Default::default() }], ..Default::default() }).expect("save");
        let raw = r#"{"name":"Drift Pack","modIds":["installed_mod","repo_missing","manual_missing"],"modRefs":{"repo_missing":{"modId":"repo_missing","title":"Repo Car","resourceId":4242}}}"#;
        let a = analyze_profile_import(&cfg, raw).expect("analyze");
        assert_eq!((a.installed_count, a.missing_downloadable.len(), a.missing_manual.len(), a.duplicate_name_exists), (1, 1, 1, true));
        assert_eq!((a.missing_downloadable[0].mod_id.as_str(), a.missing_manual[0].mod_id.as_str()), ("repo_missing", "manual_missing"));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn active_profile_set_mods_live_syncs_disk_state() {
        let (root, cfg) = make_temp_config("livesync");
        let _ = fs::write(PathBuf::from(&cfg.mods_path).join("mod_a.zip"), b"zip");
        let _ = fs::write(PathBuf::from(&cfg.mods_path).join("mod_b.zip"), b"zip");
        let p1 = ModProfile { id: "p1".into(), name: "Active".into(), mod_ids: vec!["mod_a".into(), "mod_b".into()], ..Default::default() };
        save_manager_state(&cfg.user_path, &ManagerStateFile { active_profile_id: Some("p1".into()), profiles: vec![p1], ..Default::default() }).expect("save");
        crate::local_mods::profiles::set_profile_mods(&cfg, "p1", vec!["mod_a".into()]).expect("live sync");
        assert!(PathBuf::from(&cfg.mods_path).join("mod_a.zip").exists());
        assert!(PathBuf::from(&cfg.disabled_path).join("mod_b.zip").exists());
        let _ = fs::remove_dir_all(root);
    }
}
