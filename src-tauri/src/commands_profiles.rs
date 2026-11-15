use crate::beamng_env::detect_beamng_config;
use crate::local_mods::{profile_ops, profiles};
use crate::models::{
    ApplyProfileResult, ModProfile, ProfileApplyPreview, ProfileImportAnalysis, ProfileModRef,
    ProfilesState,
};
use std::collections::HashMap;

async fn blocking<F, T>(f: F) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    tokio::task::spawn_blocking(f).await.map_err(|e| format!("Background task failed: {}", e))?
}

#[tauri::command]
pub fn delete_mod_profile(profile_id: String) -> Result<(), String> {
    profiles::delete_profile(&detect_beamng_config()?, &profile_id)
}

#[tauri::command]
pub fn get_profiles_state() -> Result<ProfilesState, String> {
    profiles::get_profiles_state(&detect_beamng_config()?)
}

#[tauri::command]
pub async fn create_profile_v2(
    name: String, description: String, tag: String, pin_policy: String,
    source_mode: String, source_profile_id: Option<String>, mod_ids: Option<Vec<String>>,
) -> Result<ModProfile, String> {
    blocking(move || profiles::create_profile_v2(
        &detect_beamng_config()?, &name, &description, &tag, &pin_policy,
        &source_mode, source_profile_id.as_deref(), mod_ids,
    )).await
}

#[tauri::command]
pub fn update_profile_meta(
    profile_id: String, name: String, description: String, tag: String, pin_policy: String,
) -> Result<ModProfile, String> {
    profiles::update_profile_meta(&detect_beamng_config()?, &profile_id, &name, &description, &tag, &pin_policy)
}

#[tauri::command]
pub async fn set_profile_mods(profile_id: String, mod_ids: Vec<String>) -> Result<ModProfile, String> {
    blocking(move || profiles::set_profile_mods(&detect_beamng_config()?, &profile_id, mod_ids)).await
}

#[tauri::command]
pub async fn sync_profile_to_active(profile_id: String) -> Result<ModProfile, String> {
    blocking(move || profiles::sync_profile_to_active(&detect_beamng_config()?, &profile_id)).await
}

#[tauri::command]
pub async fn duplicate_profile(profile_id: String, new_name: String) -> Result<ModProfile, String> {
    blocking(move || profiles::duplicate_profile(&detect_beamng_config()?, &profile_id, &new_name)).await
}

#[tauri::command]
pub async fn preview_apply_profile(profile_id: String, keep_pinned_override: Option<bool>) -> Result<ProfileApplyPreview, String> {
    blocking(move || profile_ops::preview_apply_profile(&detect_beamng_config()?, &profile_id, keep_pinned_override)).await
}

#[tauri::command]
pub async fn apply_profile_v2(profile_id: String, keep_pinned_override: Option<bool>) -> Result<ApplyProfileResult, String> {
    blocking(move || profile_ops::apply_profile_v2(&detect_beamng_config()?, &profile_id, keep_pinned_override)).await
}

#[tauri::command]
pub async fn undo_last_profile_apply() -> Result<ApplyProfileResult, String> {
    blocking(move || profile_ops::undo_last_profile_apply(&detect_beamng_config()?)).await
}

#[tauri::command]
pub async fn analyze_profile_import(raw_json: String) -> Result<ProfileImportAnalysis, String> {
    blocking(move || profile_ops::analyze_profile_import(&detect_beamng_config()?, &raw_json)).await
}

#[tauri::command]
pub async fn commit_imported_profile(
    name: String, description: String, tag: String, pin_policy: String,
    mod_ids: Vec<String>, mod_refs: HashMap<String, ProfileModRef>,
) -> Result<ModProfile, String> {
    blocking(move || profile_ops::commit_imported_profile(
        &detect_beamng_config()?, &name, &description, &tag, &pin_policy, mod_ids, mod_refs,
    )).await
}
