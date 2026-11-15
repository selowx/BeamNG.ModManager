pub mod beamng_env;
pub mod bridge_client;
pub mod cache_manager;
pub mod clipboard;
pub mod commands_downloads;
pub mod commands_profiles;
pub mod conflict_scanner;
pub mod local_mods;
pub mod models;
pub mod models_state;
pub mod repo_client;
#[cfg(test)]
mod integration_tests;

use beamng_env::{detect_beamng_config, launch_beamng, open_in_explorer, open_url_in_browser};
use conflict_scanner::scan_mods_health;
use local_mods::{
    bulk_set_mods_active, delete_mod, import_external_zips, list_local_mods, set_mod_active,
    sync_staged_mods, toggle_mod_pin,
};
use models::{
    BeamNGConfig, BridgeStatus, BridgeSubResult, CacheClearResult, CacheSummary,
    CatalogHydrateTarget, LocalMod, ModUpdateEntry, RepoModDetails, RepoModItem,
    RepoPageResponse, RepoWebStatus, ScanReport,
};
use repo_client::{
    browse_repo, check_updates_for_installed, current_web_status, fetch_repo_mod_details,
    fetch_repo_mod_updates, hydrate_repo_items as hydrate_repo_items_client,
};

#[tauri::command]
fn get_beamng_config() -> Result<BeamNGConfig, String> { detect_beamng_config() }

#[tauri::command]
async fn get_local_mods() -> Result<Vec<LocalMod>, String> {
    let cfg = tokio::task::spawn_blocking(detect_beamng_config).await.map_err(|e| e.to_string())??;
    bridge_client::ensure_subscribed_tags_loaded(&cfg).await;
    tokio::task::spawn_blocking(move || list_local_mods(&cfg)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn toggle_mod(mod_id: String, active: bool) -> Result<(), String> {
    tokio::task::spawn_blocking(move || set_mod_active(&detect_beamng_config()?, &mod_id, active)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn bulk_toggle_mods(mod_ids: Vec<String>, active: bool) -> Result<usize, String> {
    tokio::task::spawn_blocking(move || bulk_set_mods_active(&detect_beamng_config()?, &mod_ids, active)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
fn toggle_pin(mod_id: String) -> Result<bool, String> { toggle_mod_pin(&detect_beamng_config()?, &mod_id) }

#[tauri::command]
async fn remove_local_mod(mod_id: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || delete_mod(&detect_beamng_config()?, &mod_id)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn import_zips(paths: Vec<String>) -> Result<usize, String> {
    tokio::task::spawn_blocking(move || import_external_zips(&detect_beamng_config()?, &paths)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn apply_staged_mods() -> Result<usize, String> {
    tokio::task::spawn_blocking(move || sync_staged_mods(&detect_beamng_config()?)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn fetch_repo_mods(
    category: String, sort_by: String, page: u32, per_page: Option<u32>, search_query: String, force_refresh: Option<bool>,
) -> Result<RepoPageResponse, String> {
    browse_repo(category, sort_by, page, per_page, search_query, force_refresh.unwrap_or(false)).await
}

#[tauri::command]
async fn hydrate_repo_items(targets: Vec<CatalogHydrateTarget>) -> Result<Vec<RepoModItem>, String> {
    hydrate_repo_items_client(targets).await
}

#[tauri::command]
async fn check_local_mods_changed() -> Result<bool, String> {
    tokio::task::spawn_blocking(|| {
        let cfg = detect_beamng_config()?;
        Ok(local_mods::watcher::check_and_update_signature(&cfg))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    open_url_in_browser(&url)
}

#[tauri::command]
async fn get_repo_mod_details(slug: String, resource_id: u64) -> Result<RepoModDetails, String> {
    fetch_repo_mod_details(slug, resource_id).await
}

#[tauri::command]
async fn get_repo_mod_updates(slug: String, resource_id: u64) -> Result<Vec<ModUpdateEntry>, String> {
    fetch_repo_mod_updates(slug, resource_id).await
}

#[tauri::command]
async fn check_mod_updates() -> Result<Vec<LocalMod>, String> {
    check_updates_for_installed().await
}

#[tauri::command]
async fn run_health_scan() -> Result<ScanReport, String> {
    tokio::task::spawn_blocking(|| {
        let cfg = detect_beamng_config()?;
        scan_mods_health(&cfg)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn start_beamng(mode: Option<String>) -> Result<(), String> {
    let cfg = detect_beamng_config()?;
    launch_beamng(&cfg.install_path, mode.as_deref().unwrap_or("steam"))
}

#[tauri::command]
fn open_mod_folder(folder_type: String) -> Result<(), String> {
    let cfg = detect_beamng_config()?;
    let target = match folder_type.as_str() {
        "repo" => cfg.repo_path,
        "disabled" => cfg.disabled_path,
        "staging" => cfg.staging_path,
        "install" => cfg.install_path,
        "user" => cfg.user_path,
        _ => cfg.mods_path,
    };
    open_in_explorer(&target)
}

#[tauri::command]
async fn get_cache_summary() -> Result<CacheSummary, String> {
    tokio::task::spawn_blocking(|| {
        let cfg = detect_beamng_config()?;
        Ok(cache_manager::get_cache_summary(&cfg))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn clear_app_cache(scope: String) -> Result<CacheClearResult, String> {
    tokio::task::spawn_blocking(move || {
        let cfg = detect_beamng_config()?;
        cache_manager::clear_app_cache(&cfg, &scope)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn get_bridge_status() -> Result<BridgeStatus, String> {
    let cfg = tokio::task::spawn_blocking(detect_beamng_config).await.map_err(|e| e.to_string())??;
    Ok(bridge_client::get_bridge_status(&cfg).await)
}

#[tauri::command]
async fn install_bridge_extension() -> Result<BridgeStatus, String> {
    let cfg = tokio::task::spawn_blocking(detect_beamng_config).await.map_err(|e| e.to_string())??;
    bridge_client::install_bridge_extension(&cfg).await
}

#[tauri::command]
async fn reload_bridge_extension() -> Result<BridgeStatus, String> {
    let cfg = tokio::task::spawn_blocking(detect_beamng_config).await.map_err(|e| e.to_string())??;
    bridge_client::assets::reload_bridge_extension(&cfg).await
}

#[tauri::command]
async fn uninstall_bridge_extension() -> Result<BridgeStatus, String> {
    let cfg = tokio::task::spawn_blocking(detect_beamng_config).await.map_err(|e| e.to_string())??;
    let status = bridge_client::uninstall_bridge_extension(&cfg).await?;
    repo_client::clear_bridge_caches();
    local_mods::invalidate_local_mods_cache();
    Ok(status)
}

#[tauri::command]
async fn update_bridge_settings(enabled: bool, port: u16) -> Result<BridgeStatus, String> {
    let cfg = tokio::task::spawn_blocking(detect_beamng_config).await.map_err(|e| e.to_string())??;
    let status = bridge_client::update_bridge_settings(&cfg, enabled, port).await?;
    repo_client::clear_bridge_caches();
    local_mods::invalidate_local_mods_cache();
    Ok(status)
}

#[tauri::command]
fn get_repo_web_status() -> Result<RepoWebStatus, String> {
    Ok(current_web_status())
}

#[tauri::command]
async fn bridge_subscribe_mod(tag_id: String) -> Result<BridgeSubResult, String> {
    let cfg = tokio::task::spawn_blocking(detect_beamng_config).await.map_err(|e| e.to_string())??;
    bridge_client::subscribe_via_bridge(&cfg, &tag_id).await
}

#[tauri::command]
async fn bridge_unsubscribe_mod(
    tag_id: String, delete_local: bool, local_mod_id: Option<String>,
) -> Result<BridgeSubResult, String> {
    let cfg = tokio::task::spawn_blocking(detect_beamng_config).await.map_err(|e| e.to_string())??;
    let res = bridge_client::unsubscribe_via_bridge(&cfg, &tag_id).await?;
    if res.ok && delete_local {
        if let Some(mod_id) = local_mod_id.filter(|s| !s.trim().is_empty()) {
            tokio::task::spawn_blocking(move || delete_mod(&cfg, &mod_id))
                .await
                .map_err(|e| e.to_string())??;
        }
    }
    Ok(res)
}

#[tauri::command]
fn read_clipboard_text() -> Result<String, String> { clipboard::read_clipboard_text() }

#[tauri::command]
fn write_clipboard_text(text: String) -> Result<(), String> { clipboard::write_clipboard_text(&text) }

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            local_mods::watcher::start_local_mods_watcher(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_beamng_config, get_local_mods, toggle_mod, bulk_toggle_mods, toggle_pin,
            remove_local_mod, import_zips, apply_staged_mods,
            commands_profiles::delete_mod_profile,
            commands_profiles::get_profiles_state, commands_profiles::create_profile_v2,
            commands_profiles::update_profile_meta, commands_profiles::set_profile_mods,
            commands_profiles::sync_profile_to_active, commands_profiles::duplicate_profile,
            commands_profiles::preview_apply_profile, commands_profiles::apply_profile_v2,
            commands_profiles::undo_last_profile_apply, commands_profiles::analyze_profile_import,
            commands_profiles::commit_imported_profile,
            commands_downloads::get_download_manager_state, commands_downloads::enqueue_downloads,
            commands_downloads::pause_download, commands_downloads::pause_all_downloads,
            commands_downloads::resume_download, commands_downloads::resume_all_downloads,
            commands_downloads::prioritize_download, commands_downloads::retry_download,
            commands_downloads::retry_all_failed_downloads, commands_downloads::cancel_all_downloads,
            commands_downloads::update_download_settings, commands_downloads::clear_download_history,
            commands_downloads::cancel_download,
            fetch_repo_mods, hydrate_repo_items, check_local_mods_changed,
            get_repo_mod_details, get_repo_mod_updates,
            check_mod_updates, run_health_scan, start_beamng, open_mod_folder, open_external_url,
            get_bridge_status, install_bridge_extension, reload_bridge_extension,
            uninstall_bridge_extension, update_bridge_settings, get_repo_web_status,
            bridge_subscribe_mod, bridge_unsubscribe_mod, get_cache_summary, clear_app_cache,
            read_clipboard_text, write_clipboard_text,
        ])
        .run(tauri::generate_context!())
        .expect("Failed to start BeamNG ModManager");
}
