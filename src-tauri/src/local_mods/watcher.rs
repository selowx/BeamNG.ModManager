use crate::beamng_env::detect_beamng_config;
use crate::models::BeamNGConfig;
use once_cell::sync::Lazy;
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

static LAST_SIGNATURE: Lazy<Mutex<Option<u64>>> = Lazy::new(|| Mutex::new(None));

fn modified_nanos(meta: &fs::Metadata) -> u128 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_nanos())
        .unwrap_or(0)
}

fn collect_zip_sigs(dir: &Path, tag: &'static str, out: &mut Vec<(&'static str, String, u64, u128)>) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.extension().and_then(|e| e.to_str()).is_some_and(|e| e.eq_ignore_ascii_case("zip")) {
            continue;
        }
        let Ok(meta) = fs::metadata(&path) else { continue };
        if !meta.is_file() { continue; }
        let name = entry.file_name().to_string_lossy().to_lowercase();
        out.push((tag, name, meta.len(), modified_nanos(&meta)));
    }
}

fn collect_unpacked_sigs(unpacked_dir: &Path, out: &mut Vec<(String, u128, u128)>) {
    let Ok(entries) = fs::read_dir(unpacked_dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(meta) = fs::metadata(&path) else { continue };
        if !meta.is_dir() { continue; }
        let dirname = entry.file_name().to_string_lossy().to_lowercase();
        if dirname.eq_ignore_ascii_case("modmanager_bridge") { continue; }
        let mod_info_mtime = fs::metadata(path.join("mod_info")).ok().map(|m| modified_nanos(&m)).unwrap_or(0);
        out.push((dirname, modified_nanos(&meta), mod_info_mtime));
    }
}

/// Computes a fast metadata-only signature across mod directories, unpacked dirs, and `db.json`.
pub fn compute_local_mods_signature(config: &BeamNGConfig) -> u64 {
    let mut zips = Vec::new();
    collect_zip_sigs(Path::new(&config.repo_path), "repo", &mut zips);
    collect_zip_sigs(Path::new(&config.mods_path), "mods", &mut zips);
    collect_zip_sigs(Path::new(&config.disabled_path), "disabled", &mut zips);
    collect_zip_sigs(Path::new(&config.staging_path), "staging", &mut zips);
    zips.sort_unstable();

    let mut unpacked = Vec::new();
    collect_unpacked_sigs(&Path::new(&config.mods_path).join("unpacked"), &mut unpacked);
    unpacked.sort_unstable();

    let db_sig = match fs::metadata(&config.db_json_path) {
        Ok(meta) => (true, meta.len(), modified_nanos(&meta)),
        Err(_) => (false, 0u64, 0u128),
    };

    let mut hasher = DefaultHasher::new();
    zips.hash(&mut hasher);
    unpacked.hash(&mut hasher);
    db_sig.hash(&mut hasher);
    hasher.finish()
}

pub fn record_signature(config: &BeamNGConfig) {
    let sig = compute_local_mods_signature(config);
    if let Ok(mut guard) = LAST_SIGNATURE.lock() {
        *guard = Some(sig);
    }
}

pub fn check_and_update_signature(config: &BeamNGConfig) -> bool {
    let sig = compute_local_mods_signature(config);
    let Ok(mut guard) = LAST_SIGNATURE.lock() else { return false };
    match *guard {
        Some(prev) if prev != sig => {
            *guard = Some(sig);
            super::invalidate_local_mods_cache();
            true
        }
        None => {
            *guard = Some(sig);
            false
        }
        Some(_) => false,
    }
}

/// Polls mod directory metadata every 2.5s and emits `local-mods-changed` once external writes settle.
pub fn start_local_mods_watcher(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_millis(2500));
        loop {
            interval.tick().await;
            let first = tokio::task::spawn_blocking(|| {
                detect_beamng_config().ok().map(|cfg| (compute_local_mods_signature(&cfg), cfg))
            }).await;
            let Ok(Some((sig1, cfg))) = first else { continue };

            let prev = match LAST_SIGNATURE.lock() {
                Ok(mut guard) => match *guard {
                    None => { *guard = Some(sig1); continue; }
                    Some(p) => p,
                },
                Err(_) => continue,
            };
            if sig1 == prev { continue; }

            tokio::time::sleep(Duration::from_millis(350)).await;
            let Ok(sig2) = tokio::task::spawn_blocking(move || compute_local_mods_signature(&cfg)).await else { continue };
            if sig2 != sig1 { continue; }

            let changed = LAST_SIGNATURE.lock().ok().is_some_and(|mut guard| {
                if guard.is_some_and(|cur| cur != sig2) {
                    *guard = Some(sig2);
                    true
                } else {
                    false
                }
            });
            if changed {
                super::invalidate_local_mods_cache();
                let _ = app.emit("local-mods-changed", ());
            }
        }
    });
}
