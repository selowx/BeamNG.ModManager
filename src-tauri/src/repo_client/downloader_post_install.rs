use crate::beamng_env::{is_game_running, load_manager_state, save_manager_state};
use crate::local_mods::move_file_safe;
use crate::local_mods::scanner::{collect_zips_in_dir, inspect_zip_metadata, normalize_mod_category};
use crate::models::{
    BeamNGConfig, CachedModMeta, DownloadProgressPayload, ManagerStateFile, ProfileModRef,
    RepoModDetails,
};
use serde_json::Value;
use std::fs::{self, File};
use std::io::Read;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use zip::ZipArchive;

fn unix_now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn mod_id_from_filename(filename: &str) -> String {
    filename.strip_suffix(".zip").or_else(|| filename.strip_suffix(".ZIP")).unwrap_or(filename).to_lowercase()
}

fn read_zip_info_version(zip_path: &Path) -> Option<String> {
    let mut archive = ZipArchive::new(File::open(zip_path).ok()?).ok()?;
    let mut info_name = None;
    for i in 0..archive.len() {
        if let Ok(entry) = archive.by_index_raw(i) {
            let lower = entry.name().replace('\\', "/").to_lowercase();
            if lower.starts_with("mod_info/") && lower.ends_with("/info.json") {
                info_name = Some(entry.name().to_string());
                break;
            }
        }
    }
    let mut entry = archive.by_name(&info_name?).ok()?;
    let mut buf = String::new();
    entry.read_to_string(&mut buf).ok()?;
    let val = serde_json::from_str::<Value>(&buf).ok()?;
    val.get("version_string").and_then(|v| v.as_str()).map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

fn cache_entry_matches(meta: &CachedModMeta, resource_id: Option<u64>, tag_id: Option<&str>) -> bool {
    (resource_id.is_some() && meta.resource_id == resource_id)
        || tag_id.is_some_and(|tid| meta.tag_id.as_deref().is_some_and(|t| t.eq_ignore_ascii_case(tid)))
}

fn db_entry_matches(entry: &Value, resource_id: Option<u64>, tag_id: Option<&str>) -> bool {
    let rid_match = resource_id.is_some()
        && entry.get("modData").and_then(|md| md.get("resource_id")).and_then(|v| v.as_u64()) == resource_id;
    let tag_match = tag_id.is_some_and(|tid| {
        entry.get("modData").and_then(|md| md.get("tagid")).and_then(|v| v.as_str())
            .or_else(|| entry.get("modID").and_then(|v| v.as_str()))
            .is_some_and(|s| s.eq_ignore_ascii_case(tid))
    });
    rid_match || tag_match
}

fn update_db_json_metadata(
    db_path: &Path, db_val: &mut Value, new_mod_id: &str, fresh_version: &str,
    resource_id: Option<u64>, tag_id: Option<&str>,
) {
    let Some(mods_obj) = db_val.get_mut("mods").and_then(|m| m.as_object_mut()) else { return; };
    let mut changed = false;
    for (key, entry) in mods_obj.iter_mut() {
        if key == new_mod_id || db_entry_matches(entry, resource_id, tag_id) {
            if let Some(md) = entry.get_mut("modData").and_then(|v| v.as_object_mut()) {
                md.insert("version_string".to_string(), Value::String(fresh_version.to_string()));
                if let Some(tid) = tag_id { md.insert("tagid".to_string(), Value::String(tid.to_string())); }
                if let Some(rid) = resource_id { md.insert("resource_id".to_string(), Value::Number(rid.into())); }
                changed = true;
            }
        }
    }
    if changed {
        if let Ok(updated) = serde_json::to_string_pretty(db_val) { let _ = fs::write(db_path, updated); }
    }
}

fn remove_superseded_zips(
    config: &BeamNGConfig, state: &mut ManagerStateFile, db_val_opt: Option<&Value>,
    filename: &str, new_mod_id: &str, resource_id: Option<u64>, tag_id: Option<&str>,
) {
    let mut existing = Vec::new();
    collect_zips_in_dir(Path::new(&config.repo_path), "repo", &mut existing);
    collect_zips_in_dir(Path::new(&config.mods_path), "mods", &mut existing);
    collect_zips_in_dir(Path::new(&config.disabled_path), "disabled", &mut existing);
    let db_mods = db_val_opt.and_then(|d| d.get("mods")).and_then(|m| m.as_object());

    for z in existing {
        if z.filename.eq_ignore_ascii_case(filename) || z.mod_id == new_mod_id { continue; }
        let matches_cache = state.cached_metadata.get(&z.mod_id).is_some_and(|m| cache_entry_matches(m, resource_id, tag_id));
        let matches_db = db_mods.and_then(|m| m.get(&z.mod_id)).is_some_and(|e| db_entry_matches(e, resource_id, tag_id));
        if (matches_cache || matches_db) && fs::remove_file(&z.full_path).is_ok() {
            if state.pinned_mods.iter().any(|p| p == &z.mod_id) {
                state.pinned_mods.retain(|p| p != &z.mod_id);
                if !state.pinned_mods.iter().any(|p| p == new_mod_id) { state.pinned_mods.push(new_mod_id.to_string()); }
            }
            state.cached_metadata.remove(&z.mod_id);
            state.disabled_origins.remove(&z.mod_id);
        }
    }
}

fn attach_to_active_profile(state: &mut ManagerStateFile, mod_ref: ProfileModRef) {
    let Some(active_id) = state.active_profile_id.clone() else { return; };
    let Some(profile) = state.profiles.iter_mut().find(|p| p.id == active_id) else { return; };
    if !profile.mod_ids.iter().any(|id| id == &mod_ref.mod_id) {
        profile.mod_ids.push(mod_ref.mod_id.clone());
    }
    profile.mod_refs.insert(mod_ref.mod_id.clone(), mod_ref);
    profile.updated_at = unix_now();
}

pub fn finalize_downloaded_file(
    config: &BeamNGConfig, part_path: &Path, filename: &str, resource_id: u64,
    details: &RepoModDetails, post_download_mode: &str, add_to_active_profile: bool,
) -> Result<super::InstalledModOutcome, String> {
    let game_open = is_game_running();
    let is_disabled_mode = !game_open && post_download_mode.eq_ignore_ascii_case("disabled");
    let (dest_dir, outcome_status) = if game_open {
        (Path::new(&config.staging_path), "staged")
    } else if is_disabled_mode {
        (Path::new(&config.disabled_path), "installed")
    } else {
        (Path::new(&config.repo_path), "installed")
    };
    let _ = fs::create_dir_all(dest_dir);
    let final_path = dest_dir.join(filename);
    move_file_safe(part_path, &final_path).map_err(|e| format!("Failed to finalize downloaded file: {}", e))?;

    let new_mod_id = mod_id_from_filename(filename);
    let file_meta = fs::metadata(&final_path).ok();
    let size_bytes = file_meta.as_ref().map(|m| m.len()).unwrap_or(0);
    let modified_ts = file_meta.and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_secs()).unwrap_or(0);

    let zip_meta = inspect_zip_metadata(&final_path, filename);
    let effective_rid = zip_meta.as_ref().and_then(|m| m.resource_id).or((resource_id > 0).then_some(resource_id));
    let effective_tag = zip_meta.as_ref().and_then(|m| m.tag_id.clone())
        .or_else(|| details.tag_id.clone()).map(|t| t.trim().to_string()).filter(|t| !t.is_empty());
    let title = if !details.title.trim().is_empty() { details.title.trim().to_string() }
        else { zip_meta.as_ref().map(|m| m.title.clone()).unwrap_or_else(|| filename.to_string()) };
    let author = if !details.author.trim().is_empty() { details.author.trim().to_string() }
        else { zip_meta.as_ref().map(|m| m.author.clone()).unwrap_or_else(|| "Community Mod".to_string()) };

    let mut state = load_manager_state(&config.user_path);
    if !game_open {
        let fresh_version = read_zip_info_version(&final_path)
            .or_else(|| { let dv = details.version.trim(); (!dv.is_empty()).then(|| dv.to_string()) })
            .or_else(|| zip_meta.as_ref().map(|m| m.version.clone()).filter(|v| !v.trim().is_empty()))
            .unwrap_or_else(|| "1.0".to_string());
        let db_path = Path::new(&config.db_json_path);
        let mut db_val_opt = if db_path.exists() {
            fs::read_to_string(db_path).ok().and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
        } else { None };
        remove_superseded_zips(
            config, &mut state, db_val_opt.as_ref(), filename, &new_mod_id, effective_rid, effective_tag.as_deref(),
        );
        let category = zip_meta.as_ref().map(|m| m.category.clone()).filter(|c| c != "other")
            .unwrap_or_else(|| normalize_mod_category(&details.category));
        state.cached_metadata.insert(new_mod_id.clone(), CachedModMeta {
            title: title.clone(), author: author.clone(), version: fresh_version.clone(),
            tag_id: effective_tag.clone(), resource_id: effective_rid, category,
            last_update: zip_meta.as_ref().and_then(|m| m.last_update),
            icon_url: zip_meta.and_then(|m| m.icon_url),
            size_bytes: Some(size_bytes), modified_ts: Some(modified_ts),
        });
        if is_disabled_mode {
            // Matches local_mods/ops.rs origin key for mods/repo/{filename}
            state.disabled_origins.insert(new_mod_id.clone(), "repo".to_string());
        } else {
            state.disabled_origins.remove(&new_mod_id);
        }
        if let Some(ref mut db_val) = db_val_opt {
            update_db_json_metadata(db_path, db_val, &new_mod_id, &fresh_version, effective_rid, effective_tag.as_deref());
        }
    }

    if add_to_active_profile {
        attach_to_active_profile(&mut state, ProfileModRef {
            mod_id: new_mod_id.clone(), title, filename: filename.to_string(), author,
            resource_id: effective_rid, tag_id: effective_tag,
            slug: (!details.slug.trim().is_empty()).then(|| details.slug.clone()), size_bytes,
        });
    }

    let _ = save_manager_state(&config.user_path, &state);
    crate::local_mods::invalidate_local_mods_cache();
    Ok(super::InstalledModOutcome {
        local_mod_id: new_mod_id, final_filename: filename.to_string(), size_bytes, status: outcome_status.to_string(),
    })
}

#[allow(clippy::too_many_arguments)]
pub fn emit_dl_event(
    app: &AppHandle, task_id: &str, resource_id: u64, title: &str, filename: &str,
    downloaded_bytes: u64, total_bytes: u64, speed_bps: u64, status: &str, message: Option<String>,
) {
    let _ = app.emit("download-progress", DownloadProgressPayload {
        task_id: task_id.to_string(), resource_id, title: title.to_string(), filename: filename.to_string(),
        downloaded_bytes, total_bytes, speed_bps, status: status.to_string(), message,
    });
}
