use super::invalidate_local_mods_cache;
use super::scanner::{find_mod_zip_in_active_dirs, find_zip_by_mod_id, has_repo_manifest};
use crate::beamng_env::{load_manager_state, save_manager_state};
use crate::models::BeamNGConfig;
use serde_json::Value;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

pub fn move_file_safe(src: &Path, dst: &Path) -> Result<(), String> {
    if dst.exists() {
        let _ = fs::remove_file(dst);
    }
    if fs::rename(src, dst).is_ok() {
        return Ok(());
    }

    fs::copy(src, dst)
        .map_err(|e| format!("Failed to copy file ({:?} -> {:?}): {}", src, dst, e))?;
    fs::remove_file(src)
        .map_err(|e| format!("Failed to remove source file ({:?}): {}", src, e))?;

    Ok(())
}

pub fn set_mod_active(config: &BeamNGConfig, mod_id: &str, target_active: bool) -> Result<(), String> {
    let mut state = load_manager_state(&config.user_path);
    let mod_id_lower = mod_id.to_lowercase();

    update_db_json_active(&config.db_json_path, &[mod_id_lower.clone()], target_active)?;

    let repo_dir = PathBuf::from(&config.repo_path);
    let mods_dir = PathBuf::from(&config.mods_path);
    let disabled_dir = PathBuf::from(&config.disabled_path);

    if !target_active {
        if let Some((src_path, origin)) = find_mod_zip_in_active_dirs(&repo_dir, &mods_dir, &mod_id_lower) {
            let file_name = src_path.file_name().ok_or("Invalid filename")?;
            let dest_path = disabled_dir.join(file_name);
            state.disabled_origins.insert(mod_id_lower.clone(), origin);
            move_file_safe(&src_path, &dest_path).map_err(|e| format!("Failed to move mod: {}", e))?;
        }
    } else if let Some(src_path) = find_zip_by_mod_id(&disabled_dir, &mod_id_lower) {
        let origin = state
            .disabled_origins
            .remove(&mod_id_lower)
            .unwrap_or_else(|| "repo".to_string());
        let target_dir = if origin == "mods" { &mods_dir } else { &repo_dir };
        let file_name = src_path.file_name().ok_or("Invalid filename")?;
        let dest_path = target_dir.join(file_name);
        move_file_safe(&src_path, &dest_path).map_err(|e| format!("Failed to enable mod: {}", e))?;
    }

    save_manager_state(&config.user_path, &state)?;
    invalidate_local_mods_cache();
    Ok(())
}

pub fn bulk_set_mods_active(
    config: &BeamNGConfig,
    mod_ids: &[String],
    target_active: bool,
) -> Result<usize, String> {
    bulk_set_mods_active_with_policy(config, mod_ids, target_active, false)
}

pub fn bulk_set_mods_active_with_policy(
    config: &BeamNGConfig,
    mod_ids: &[String],
    target_active: bool,
    allow_disable_pinned: bool,
) -> Result<usize, String> {
    let mut state = load_manager_state(&config.user_path);
    let pinned_set: HashSet<String> = state.pinned_mods.iter().map(|s| s.to_lowercase()).collect();

    let filtered_ids: Vec<String> = mod_ids
        .iter()
        .map(|s| s.to_lowercase())
        .filter(|id| target_active || allow_disable_pinned || !pinned_set.contains(id))
        .collect();

    if filtered_ids.is_empty() {
        return Ok(0);
    }

    update_db_json_active(&config.db_json_path, &filtered_ids, target_active)?;

    let repo_dir = PathBuf::from(&config.repo_path);
    let mods_dir = PathBuf::from(&config.mods_path);
    let disabled_dir = PathBuf::from(&config.disabled_path);

    let mut count = 0usize;
    for id in &filtered_ids {
        if !target_active {
            if let Some((src_path, origin)) = find_mod_zip_in_active_dirs(&repo_dir, &mods_dir, id) {
                if let Some(file_name) = src_path.file_name() {
                    let dest_path = disabled_dir.join(file_name);
                    if move_file_safe(&src_path, &dest_path).is_ok() {
                        state.disabled_origins.insert(id.clone(), origin);
                        count += 1;
                    }
                }
            }
        } else if let Some(src_path) = find_zip_by_mod_id(&disabled_dir, id) {
            let origin = state
                .disabled_origins
                .remove(id)
                .unwrap_or_else(|| "repo".to_string());
            let target_dir = if origin == "mods" { &mods_dir } else { &repo_dir };
            if let Some(file_name) = src_path.file_name() {
                let dest_path = target_dir.join(file_name);
                if move_file_safe(&src_path, &dest_path).is_ok() {
                    count += 1;
                }
            }
        }
    }

    save_manager_state(&config.user_path, &state)?;
    invalidate_local_mods_cache();
    Ok(count)
}

pub fn toggle_mod_pin(config: &BeamNGConfig, mod_id: &str) -> Result<bool, String> {
    let mut state = load_manager_state(&config.user_path);
    let id = mod_id.to_lowercase();
    let is_now_pinned = if let Some(pos) = state.pinned_mods.iter().position(|x| x == &id) {
        state.pinned_mods.remove(pos);
        false
    } else {
        state.pinned_mods.push(id);
        true
    };
    save_manager_state(&config.user_path, &state)?;
    invalidate_local_mods_cache();
    Ok(is_now_pinned)
}

pub fn delete_mod(config: &BeamNGConfig, mod_id: &str) -> Result<(), String> {
    let mut state = load_manager_state(&config.user_path);
    let id = mod_id.to_lowercase();
    if state.pinned_mods.contains(&id) {
        return Err("This mod is protected (pinned). Unlock it before deleting.".to_string());
    }

    let dirs = [
        PathBuf::from(&config.repo_path),
        PathBuf::from(&config.mods_path),
        PathBuf::from(&config.disabled_path),
        PathBuf::from(&config.staging_path),
    ];

    for dir in &dirs {
        if let Some(p) = find_zip_by_mod_id(dir, &id) {
            fs::remove_file(&p).map_err(|e| format!("Failed to delete file: {}", e))?;
        }
    }

    state.disabled_origins.remove(&id);
    state.cached_metadata.remove(&id);
    save_manager_state(&config.user_path, &state)?;

    if !config.game_running && Path::new(&config.db_json_path).exists() {
        if let Ok(raw) = fs::read_to_string(&config.db_json_path) {
            if let Ok(mut db_val) = serde_json::from_str::<Value>(&raw) {
                if let Some(mods_obj) = db_val.get_mut("mods").and_then(|m| m.as_object_mut()) {
                    if mods_obj.remove(&id).is_some() {
                        if let Ok(updated) = serde_json::to_string_pretty(&db_val) {
                            let _ = fs::write(&config.db_json_path, updated);
                        }
                    }
                }
            }
        }
    }

    invalidate_local_mods_cache();
    Ok(())
}

pub fn import_external_zips(config: &BeamNGConfig, source_paths: &[String]) -> Result<usize, String> {
    let target_dir = if config.game_running {
        PathBuf::from(&config.staging_path)
    } else {
        PathBuf::from(&config.mods_path)
    };

    let mut imported = 0usize;
    for src_str in source_paths {
        let src = Path::new(src_str);
        if src.exists()
            && src
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.eq_ignore_ascii_case("zip"))
                .unwrap_or(false)
        {
            if let Some(fname) = src.file_name() {
                let dest = target_dir.join(fname);
                fs::copy(src, &dest).map_err(|e| format!("Failed to copy ZIP: {}", e))?;
                imported += 1;
            }
        }
    }
    invalidate_local_mods_cache();
    Ok(imported)
}

pub fn sync_staged_mods(config: &BeamNGConfig) -> Result<usize, String> {
    let staging_dir = PathBuf::from(&config.staging_path);
    let repo_dir = PathBuf::from(&config.repo_path);
    let mods_dir = PathBuf::from(&config.mods_path);

    let mut moved = 0usize;
    if let Ok(entries) = fs::read_dir(&staging_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.eq_ignore_ascii_case("zip"))
                .unwrap_or(false)
            {
                let is_repo_mod = has_repo_manifest(&path);
                let dest_dir = if is_repo_mod { &repo_dir } else { &mods_dir };
                if let Some(fname) = path.file_name() {
                    let dest_path = dest_dir.join(fname);
                    move_file_safe(&path, &dest_path)
                        .map_err(|e| format!("Failed to move staged mod: {}", e))?;
                    moved += 1;
                }
            }
        }
    }
    invalidate_local_mods_cache();
    Ok(moved)
}

pub fn update_db_json_active(db_path_str: &str, mod_ids: &[String], active: bool) -> Result<(), String> {
    let db_path = Path::new(db_path_str);
    if !db_path.exists() {
        return Ok(());
    }
    let raw = fs::read_to_string(db_path).map_err(|e| format!("Failed to read db.json: {}", e))?;
    let mut db_val: Value =
        serde_json::from_str(&raw).map_err(|e| format!("Failed to parse db.json: {}", e))?;

    let mut changed = false;
    if let Some(mods_obj) = db_val.get_mut("mods").and_then(|m| m.as_object_mut()) {
        for id in mod_ids {
            if let Some(entry) = mods_obj.get_mut(id) {
                if let Some(obj) = entry.as_object_mut() {
                    obj.insert("active".to_string(), Value::Bool(active));
                    changed = true;
                }
            }
        }
    }

    if changed {
        let updated = serde_json::to_string_pretty(&db_val)
            .map_err(|e| format!("Failed to serialize db.json: {}", e))?;
        fs::write(db_path, updated).map_err(|e| format!("Failed to write db.json: {}", e))?;
    }
    Ok(())
}
