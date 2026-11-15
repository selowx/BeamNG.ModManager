use crate::beamng_env::{save_manager_state, state_file_path};
use crate::models::{BeamNGConfig, CacheClearResult, CacheSummary, ManagerStateFile};
use std::fs;
use std::path::{Path, PathBuf};

const REPO_CATALOG_FILENAME: &str = "modmanager_repo_catalog.json";

fn is_part_file(path: &Path) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.to_ascii_lowercase().ends_with(".part"))
        .unwrap_or(false)
}

fn scan_staging_parts(staging_path: &str) -> (usize, u64, Vec<(PathBuf, u64)>) {
    let Ok(entries) = fs::read_dir(Path::new(staging_path)) else { return (0, 0, Vec::new()); };
    let (mut found, mut total_bytes) = (Vec::new(), 0u64);
    for entry in entries.flatten() {
        let path = entry.path();
        if !entry.file_type().map(|ft| ft.is_file()).unwrap_or(false) || !is_part_file(&path) { continue; }
        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
        total_bytes = total_bytes.saturating_add(size);
        found.push((path, size));
    }
    (found.len(), total_bytes, found)
}

fn read_state_if_exists(user_path: &str) -> Result<Option<ManagerStateFile>, String> {
    let path = state_file_path(user_path);
    if !path.is_file() { return Ok(None); }
    let raw = fs::read_to_string(&path).map_err(|e| format!("Failed to read state file: {}", e))?;
    serde_json::from_str::<ManagerStateFile>(&raw).map(Some).map_err(|e| format!("Failed to parse state file: {}", e))
}

pub(crate) fn clear_local_metadata_state(user_path: &str) -> Result<(usize, u64), String> {
    let path = state_file_path(user_path);
    let Some(mut state) = read_state_if_exists(user_path)? else { return Ok((0, 0)); };
    if state.cached_metadata.is_empty() { return Ok((0, 0)); }
    let (before_bytes, cleared) = (fs::metadata(&path).map(|m| m.len()).unwrap_or(0), state.cached_metadata.len());
    state.cached_metadata.clear();
    save_manager_state(user_path, &state)?;
    let after_bytes = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
    Ok((cleared, before_bytes.saturating_sub(after_bytes)))
}

pub(crate) fn clear_staging_parts(staging_path: &str) -> Result<(usize, u64), String> {
    let (_, _, files) = scan_staging_parts(staging_path);
    let (mut cleared, mut freed) = (0usize, 0u64);
    for (path, size) in files {
        fs::remove_file(&path).map_err(|e| format!("Failed to remove staging part {}: {}", path.display(), e))?;
        cleared += 1;
        freed = freed.saturating_add(size);
    }
    Ok((cleared, freed))
}

fn clear_repo_scope(cfg: &BeamNGConfig) -> Result<(usize, u64), String> {
    let mut cleared = crate::repo_client::clear_repo_memory_caches() + crate::bridge_client::clear_memory_caches();
    crate::local_mods::invalidate_local_mods_cache();
    let mut freed = 0u64;
    let catalog_path = Path::new(&cfg.user_path).join(REPO_CATALOG_FILENAME);
    if catalog_path.is_file() {
        let size = fs::metadata(&catalog_path).map(|m| m.len()).unwrap_or(0);
        fs::remove_file(&catalog_path).map_err(|e| format!("Failed to remove repo catalog cache: {}", e))?;
        freed = freed.saturating_add(size);
        cleared += 1;
    }
    Ok((cleared, freed))
}

fn clear_local_metadata_scope(cfg: &BeamNGConfig) -> Result<(usize, u64), String> {
    let mem_cleared = crate::local_mods::clear_local_mods_cache_counted();
    let (disk_cleared, disk_freed) = clear_local_metadata_state(&cfg.user_path)?;
    Ok((mem_cleared + disk_cleared, disk_freed))
}

pub fn get_cache_summary(cfg: &BeamNGConfig) -> CacheSummary {
    let catalog_path = Path::new(&cfg.user_path).join(REPO_CATALOG_FILENAME);
    let catalog_exists = catalog_path.is_file();
    let catalog_bytes = if catalog_exists { fs::metadata(&catalog_path).map(|m| m.len()).unwrap_or(0) } else { 0 };
    let local_metadata_entries = read_state_if_exists(&cfg.user_path).ok().flatten().map(|s| s.cached_metadata.len()).unwrap_or(0);
    let (staging_part_files, staging_part_bytes, _) = scan_staging_parts(&cfg.staging_path);
    let memory_repo_entries = crate::repo_client::memory_repo_cache_count() + crate::bridge_client::memory_cache_count();
    let memory_update_entries = crate::repo_client::update_checker::memory_update_cache_count();
    CacheSummary { catalog_bytes, catalog_exists, local_metadata_entries, staging_part_files, staging_part_bytes, memory_repo_entries, memory_update_entries }
}

pub fn clear_app_cache(cfg: &BeamNGConfig, scope: &str) -> Result<CacheClearResult, String> {
    let (cleared_entries, freed_bytes) = match scope {
        "repo" => clear_repo_scope(cfg)?,
        "local_metadata" => clear_local_metadata_scope(cfg)?,
        "staging_parts" => clear_staging_parts(&cfg.staging_path)?,
        "all" => {
            let (c1, f1) = clear_repo_scope(cfg)?;
            let (c2, f2) = clear_local_metadata_scope(cfg)?;
            let (c3, f3) = clear_staging_parts(&cfg.staging_path)?;
            (c1 + c2 + c3, f1.saturating_add(f2).saturating_add(f3))
        }
        other => return Err(format!("Unknown cache scope: {}", other)),
    };
    Ok(CacheClearResult { scope: scope.to_string(), freed_bytes, cleared_entries })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{CachedModMeta, ModProfile};
    use std::collections::HashMap;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn make_temp_dir(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let dir = std::env::temp_dir().join(format!(
            "beamng_mm_{}_{}_{}",
            label,
            std::process::id(),
            nanos
        ));
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    #[test]
    fn clear_staging_parts_deletes_only_part_files_and_preserves_zips_and_dirs() {
        let dir = make_temp_dir("staging_parts");
        let zip_file = dir.join("keep_mod.zip");
        let part_lower = dir.join("partial_mod.zip.part");
        let part_upper = dir.join("OTHER.PART");
        let nested_dir = dir.join("subdir.part");
        fs::create_dir_all(&nested_dir).unwrap();
        fs::write(&zip_file, b"zip-content").unwrap();
        fs::write(&part_lower, b"12345").unwrap();
        fs::write(&part_upper, b"6789").unwrap();

        let (cleared, freed) = clear_staging_parts(dir.to_str().unwrap()).unwrap();
        assert_eq!(cleared, 2);
        assert_eq!(freed, 9);
        assert!(zip_file.exists());
        assert!(nested_dir.is_dir());
        assert!(!part_lower.exists());
        assert!(!part_upper.exists());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn clear_local_metadata_state_preserves_pins_origins_and_profiles() {
        let dir = make_temp_dir("local_meta");
        let mut origins = HashMap::new();
        origins.insert("mod_a".to_string(), "repo".to_string());
        let mut cached = HashMap::new();
        cached.insert(
            "mod_a".to_string(),
            CachedModMeta {
                title: "Mod A".to_string(),
                author: "Author".to_string(),
                version: "1.0".to_string(),
                tag_id: Some("TAG_A".to_string()),
                resource_id: Some(12345),
                category: "vehicle".to_string(),
                last_update: Some(1000),
                icon_url: None,
                size_bytes: Some(2048),
                modified_ts: Some(1000),
            },
        );
        let state = ManagerStateFile {
            pinned_mods: vec!["pinned_one".to_string()],
            disabled_origins: origins.clone(),
            cached_metadata: cached,
            profiles: vec![ModProfile {
                id: "p1".to_string(),
                name: "Career".to_string(),
                mod_ids: vec!["mod_a".to_string()],
                created_at: 42,
                ..Default::default()
            }],
            ..Default::default()
        };
        save_manager_state(dir.to_str().unwrap(), &state).unwrap();

        let (cleared, _) = clear_local_metadata_state(dir.to_str().unwrap()).unwrap();
        assert_eq!(cleared, 1);

        let reloaded = read_state_if_exists(dir.to_str().unwrap())
            .unwrap()
            .expect("state file preserved");
        assert!(reloaded.cached_metadata.is_empty());
        assert_eq!(reloaded.pinned_mods, vec!["pinned_one".to_string()]);
        assert_eq!(reloaded.disabled_origins, origins);
        assert_eq!(reloaded.profiles.len(), 1);
        assert_eq!(reloaded.profiles[0].name, "Career");
        assert_eq!(reloaded.profiles[0].mod_ids, vec!["mod_a".to_string()]);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn clear_app_cache_rejects_unknown_scope() {
        let dir = make_temp_dir("bad_scope");
        let cfg = BeamNGConfig {
            version: "0.40".into(),
            install_path: dir.to_string_lossy().into(),
            user_path: dir.to_string_lossy().into(),
            mods_path: dir.to_string_lossy().into(),
            repo_path: dir.to_string_lossy().into(),
            disabled_path: dir.to_string_lossy().into(),
            staging_path: dir.to_string_lossy().into(),
            db_json_path: dir.join("db.json").to_string_lossy().into(),
            game_running: false,
            staged_count: 0,
        };
        let err = clear_app_cache(&cfg, "invalid").unwrap_err();
        assert!(err.contains("Unknown cache scope"));
        let _ = fs::remove_dir_all(&dir);
    }
}
