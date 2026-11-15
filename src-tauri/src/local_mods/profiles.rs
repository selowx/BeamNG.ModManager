use crate::beamng_env::{load_manager_state, save_manager_state};
use crate::models::{BeamNGConfig, LocalMod, ManagerStateFile, ModProfile, ProfileModRef, ProfilesState};
use std::collections::{HashMap, HashSet};
use std::time::{SystemTime, UNIX_EPOCH};

pub(crate) fn now_unix() -> (u64, u128) {
    let d = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    (d.as_secs(), d.as_millis())
}

pub(crate) fn normalize_mod_ids(ids: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    ids.into_iter().map(|s| s.trim().to_lowercase()).filter(|s| !s.is_empty() && seen.insert(s.clone())).collect()
}

pub(crate) fn normalize_pin_policy(raw: &str) -> String {
    if raw.trim().eq_ignore_ascii_case("strict") { "strict".into() } else { "keep_pinned".into() }
}

pub(crate) fn normalize_tag(raw: &str) -> String {
    let t = raw.trim();
    if t.is_empty() { "general".into() } else { t.to_lowercase() }
}

fn validate_profile_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim().to_string();
    if trimmed.is_empty() { Err("Profile name cannot be empty.".into()) } else { Ok(trimmed) }
}

fn active_local_mod_ids(config: &BeamNGConfig) -> Result<Vec<String>, String> {
    let mods = super::get_cached_or_list_local_mods(config)?;
    Ok(normalize_mod_ids(mods.into_iter().filter(|m| m.active && m.location != "unpacked").map(|m| m.id).collect()))
}

pub(crate) fn build_profile(
    name: String,
    description: &str,
    tag: &str,
    pin_policy: &str,
    mod_ids: Vec<String>,
    mod_refs: HashMap<String, ProfileModRef>,
) -> ModProfile {
    let (ts_secs, ts_millis) = now_unix();
    ModProfile {
        id: format!("pack_{}", ts_millis),
        name,
        description: description.trim().to_string(),
        tag: normalize_tag(tag),
        mod_ids,
        mod_refs,
        pin_policy: normalize_pin_policy(pin_policy),
        created_at: ts_secs,
        updated_at: ts_secs,
        last_applied_at: None,
    }
}

pub(crate) fn hydrate_mod_refs_with_locals(
    local_mods: &[LocalMod],
    state: &ManagerStateFile,
    mod_ids: &[String],
    prior_refs: &HashMap<String, ProfileModRef>,
) -> HashMap<String, ProfileModRef> {
    let local_map: HashMap<String, &LocalMod> = local_mods.iter().map(|m| (m.id.to_lowercase(), m)).collect();
    let mut hydrated = HashMap::new();

    for raw_id in mod_ids {
        let id = raw_id.trim().to_lowercase();
        if id.is_empty() { continue; }
        if let Some(local) = local_map.get(&id) {
            let mut r = ProfileModRef::from_local_mod(local);
            if let Some(prev) = prior_refs.get(&id) {
                r.resource_id = r.resource_id.or(prev.resource_id);
                if r.tag_id.is_none() { r.tag_id = prev.tag_id.clone(); }
                if r.slug.is_none() { r.slug = prev.slug.clone(); }
            }
            hydrated.insert(id, r);
        } else if let Some(prev) = prior_refs.get(&id) {
            let mut r = prev.clone();
            r.mod_id = id.clone();
            if let Some(meta) = state.cached_metadata.get(&id) {
                if r.title.trim().is_empty() { r.title = meta.title.clone(); }
                r.resource_id = r.resource_id.or(meta.resource_id);
                if r.tag_id.is_none() { r.tag_id = meta.tag_id.clone(); }
                if r.slug.is_none() { r.slug = meta.resource_id.map(|rid| format!("resources/{}/", rid)); }
            }
            hydrated.insert(id, r);
        } else if let Some(meta) = state.cached_metadata.get(&id) {
            hydrated.insert(id.clone(), ProfileModRef {
                mod_id: id.clone(), title: meta.title.clone(), filename: format!("{}.zip", id),
                author: meta.author.clone(), resource_id: meta.resource_id, tag_id: meta.tag_id.clone(),
                slug: meta.resource_id.map(|rid| format!("resources/{}/", rid)), size_bytes: meta.size_bytes.unwrap_or(0),
            });
        }
    }
    hydrated
}

pub fn hydrate_mod_refs(
    config: &BeamNGConfig,
    state: &ManagerStateFile,
    mod_ids: &[String],
    prior_refs: &HashMap<String, ProfileModRef>,
) -> Result<HashMap<String, ProfileModRef>, String> {
    let local_mods = super::get_cached_or_list_local_mods(config)?;
    Ok(hydrate_mod_refs_with_locals(&local_mods, state, mod_ids, prior_refs))
}

pub fn get_profiles_state(config: &BeamNGConfig) -> Result<ProfilesState, String> {
    let state = load_manager_state(&config.user_path);
    Ok(ProfilesState {
        profiles: state.profiles,
        active_profile_id: state.active_profile_id,
        has_undo_backup: state.previous_profile_backup.is_some(),
    })
}

pub fn delete_profile(config: &BeamNGConfig, profile_id: &str) -> Result<(), String> {
    let mut state = load_manager_state(&config.user_path);
    state.profiles.retain(|p| p.id != profile_id);
    if state.active_profile_id.as_deref() == Some(profile_id) { state.active_profile_id = None; }
    save_manager_state(&config.user_path, &state)
}

pub fn create_profile_v2(
    config: &BeamNGConfig, name: &str, description: &str, tag: &str, pin_policy: &str,
    source_mode: &str, source_profile_id: Option<&str>, mod_ids: Option<Vec<String>>,
) -> Result<ModProfile, String> {
    let trimmed_name = validate_profile_name(name)?;
    let mut state = load_manager_state(&config.user_path);
    let mut prior_refs = HashMap::new();
    let resolved_ids = match source_mode.trim().to_lowercase().as_str() {
        "empty" => mod_ids.map(normalize_mod_ids).unwrap_or_default(),
        "copy" => {
            let src_id = source_profile_id.map(str::trim).filter(|s| !s.is_empty())
                .ok_or_else(|| "Source profile ID is required for copy mode.".to_string())?;
            let src = state.profiles.iter().find(|p| p.id == src_id)
                .ok_or_else(|| "Source profile not found.".to_string())?;
            prior_refs = src.mod_refs.clone();
            mod_ids.map(normalize_mod_ids).unwrap_or_else(|| normalize_mod_ids(src.mod_ids.clone()))
        }
        _ => match mod_ids {
            Some(ids) => normalize_mod_ids(ids),
            None => active_local_mod_ids(config)?,
        },
    };
    let hydrated = hydrate_mod_refs(config, &state, &resolved_ids, &prior_refs)?;
    let new_prof = build_profile(trimmed_name, description, tag, pin_policy, resolved_ids, hydrated);
    state.profiles.push(new_prof.clone());
    save_manager_state(&config.user_path, &state)?;
    Ok(new_prof)
}

pub fn update_profile_meta(
    config: &BeamNGConfig, profile_id: &str, name: &str, description: &str, tag: &str, pin_policy: &str,
) -> Result<ModProfile, String> {
    let trimmed_name = validate_profile_name(name)?;
    let mut state = load_manager_state(&config.user_path);
    let profile = state.profiles.iter_mut().find(|p| p.id == profile_id)
        .ok_or_else(|| "Mod profile not found.".to_string())?;
    profile.name = trimmed_name;
    profile.description = description.trim().to_string();
    profile.tag = normalize_tag(tag);
    profile.pin_policy = normalize_pin_policy(pin_policy);
    profile.updated_at = now_unix().0;
    let updated = profile.clone();
    save_manager_state(&config.user_path, &state)?;
    Ok(updated)
}

pub fn set_profile_mods(config: &BeamNGConfig, profile_id: &str, mod_ids: Vec<String>) -> Result<ModProfile, String> {
    let normalized_ids = normalize_mod_ids(mod_ids);
    let mut state = load_manager_state(&config.user_path);
    let idx = state.profiles.iter().position(|p| p.id == profile_id)
        .ok_or_else(|| "Mod profile not found.".to_string())?;
    let old_ids: HashSet<String> = state.profiles[idx].mod_ids.iter().map(|s| s.trim().to_lowercase()).collect();
    let new_set: HashSet<String> = normalized_ids.iter().cloned().collect();
    let is_active = state.active_profile_id.as_deref() == Some(profile_id);
    let prior_refs = state.profiles[idx].mod_refs.clone();
    let hydrated = hydrate_mod_refs(config, &state, &normalized_ids, &prior_refs)?;
    let profile = &mut state.profiles[idx];
    profile.mod_ids = normalized_ids.clone();
    profile.mod_refs = hydrated;
    profile.updated_at = now_unix().0;
    let updated = profile.clone();
    save_manager_state(&config.user_path, &state)?;
    if is_active && !crate::beamng_env::is_game_running() {
        let to_enable: Vec<String> = normalized_ids.iter().filter(|id| !old_ids.contains(*id)).cloned().collect();
        let to_disable: Vec<String> = old_ids.into_iter().filter(|id| !new_set.contains(id)).collect();
        if !to_enable.is_empty() { super::ops::bulk_set_mods_active(config, &to_enable, true)?; }
        if !to_disable.is_empty() { super::ops::bulk_set_mods_active_with_policy(config, &to_disable, false, true)?; }
    }
    Ok(updated)
}

pub fn sync_profile_to_active(config: &BeamNGConfig, profile_id: &str) -> Result<ModProfile, String> {
    set_profile_mods(config, profile_id, active_local_mod_ids(config)?)
}

pub fn duplicate_profile(config: &BeamNGConfig, profile_id: &str, new_name: &str) -> Result<ModProfile, String> {
    let trimmed_name = validate_profile_name(new_name)?;
    let mut state = load_manager_state(&config.user_path);
    let src = state.profiles.iter().find(|p| p.id == profile_id).cloned()
        .ok_or_else(|| "Mod profile not found.".to_string())?;
    let norm_ids = normalize_mod_ids(src.mod_ids);
    let hydrated = hydrate_mod_refs(config, &state, &norm_ids, &src.mod_refs)?;
    let duplicated = build_profile(trimmed_name, &src.description, &src.tag, &src.pin_policy, norm_ids, hydrated);
    state.profiles.push(duplicated.clone());
    save_manager_state(&config.user_path, &state)?;
    Ok(duplicated)
}
