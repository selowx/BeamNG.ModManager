pub mod ops;
pub mod profile_ops;
pub mod profiles;
pub mod scanner;
pub mod watcher;

use crate::beamng_env::{load_manager_state, save_manager_state};
use crate::models::{BeamNGConfig, CachedModMeta, LocalMod};
use once_cell::sync::Lazy;
pub use ops::{
    bulk_set_mods_active, bulk_set_mods_active_with_policy, delete_mod, import_external_zips,
    move_file_safe, set_mod_active, sync_staged_mods, toggle_mod_pin,
};
pub use profile_ops::{
    analyze_profile_import, apply_profile_v2, commit_imported_profile, preview_apply_profile,
    undo_last_profile_apply,
};
pub use profiles::{
    create_profile_v2, delete_profile, duplicate_profile, get_profiles_state,
    set_profile_mods, sync_profile_to_active, update_profile_meta,
};
use rayon::prelude::*;
use scanner::{
    collect_unpacked_in_dir, collect_zips_in_dir, decode_mod_text, inspect_unpacked_dir_metadata,
    inspect_zip_metadata, normalize_mod_category, prettify_mod_name, RawDiskZip,
};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::fs;
use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, Instant};

static LOCAL_MODS_CACHE: Lazy<Mutex<Option<(Instant, Vec<LocalMod>)>>> =
    Lazy::new(|| Mutex::new(None));

pub fn invalidate_local_mods_cache() {
    if let Ok(mut cache) = LOCAL_MODS_CACHE.lock() {
        *cache = None;
    }
}

pub(crate) fn clear_local_mods_cache_counted() -> usize {
    if let Ok(mut cache) = LOCAL_MODS_CACHE.lock() {
        if let Some((_, mods)) = cache.take() {
            return mods.len();
        }
    }
    0
}

pub fn get_cached_or_list_local_mods(config: &BeamNGConfig) -> Result<Vec<LocalMod>, String> {
    if let Ok(cache) = LOCAL_MODS_CACHE.lock() {
        if let Some((ts, ref mods)) = *cache {
            if ts.elapsed() < Duration::from_secs(10) {
                let mut cloned = mods.clone();
                for m in &mut cloned {
                    m.subscribed = m.tag_id.as_deref().and_then(crate::bridge_client::is_tag_subscribed);
                }
                return Ok(cloned);
            }
        }
    }

    list_local_mods(config)
}

fn normalize_author(author: &str) -> String {
    match author {
        "Bilinmeyen Yapımcı" => "Unknown Author".to_string(),
        "Topluluk Modu" => "Community Mod".to_string(),
        other => other.to_string(),
    }
}

fn inspect_disk_item_meta(disk_zip: &RawDiskZip) -> Option<CachedModMeta> {
    if disk_zip.location == "unpacked" {
        Some(inspect_unpacked_dir_metadata(&disk_zip.full_path, &disk_zip.filename))
    } else {
        inspect_zip_metadata(&disk_zip.full_path, &disk_zip.filename)
    }
}

pub fn list_local_mods(config: &BeamNGConfig) -> Result<Vec<LocalMod>, String> {
    let mut state = load_manager_state(&config.user_path);
    let pinned_set: HashSet<String> = state.pinned_mods.iter().cloned().collect();

    let db_val: Value = if Path::new(&config.db_json_path).exists() {
        let raw = fs::read_to_string(&config.db_json_path).unwrap_or_default();
        serde_json::from_str(&raw).unwrap_or_else(|_| json!({ "header": { "version": 1.1 }, "mods": {} }))
    } else {
        json!({ "header": { "version": 1.1 }, "mods": {} })
    };

    let db_mods = db_val.get("mods").and_then(|m| m.as_object());

    let mut disk_zips: Vec<RawDiskZip> = Vec::new();
    collect_zips_in_dir(Path::new(&config.repo_path), "repo", &mut disk_zips);
    collect_zips_in_dir(Path::new(&config.mods_path), "mods", &mut disk_zips);
    collect_zips_in_dir(Path::new(&config.disabled_path), "disabled", &mut disk_zips);
    collect_zips_in_dir(Path::new(&config.staging_path), "staging", &mut disk_zips);
    collect_unpacked_in_dir(&Path::new(&config.mods_path).join("unpacked"), &mut disk_zips);

    let mut seen_ids = HashSet::new();
    disk_zips.retain(|z| seen_ids.insert(format!("{}:{}", z.location, z.mod_id)));

    let cached_snapshot = state.cached_metadata.clone();
    let disabled_origins_snapshot = state.disabled_origins.clone();

    let results: Vec<(LocalMod, Option<(String, CachedModMeta)>)> = disk_zips
        .into_par_iter()
        .map(|disk_zip| {
            let mod_id = disk_zip.mod_id.clone();
            let db_entry = db_mods.and_then(|m| m.get(&mod_id));

            let origin_dir = match disk_zip.location.as_str() {
                "unpacked" => "unpacked".to_string(),
                "repo" => "repo".to_string(),
                "mods" => "mods".to_string(),
                "disabled" => disabled_origins_snapshot
                    .get(&mod_id)
                    .cloned()
                    .or_else(|| {
                        db_entry
                            .and_then(|e| e.get("dirname"))
                            .and_then(|d| d.as_str())
                            .map(|d| if d.contains("repo") { "repo".to_string() } else { "mods".to_string() })
                    })
                    .unwrap_or_else(|| "repo".to_string()),
                "staging" => "repo".to_string(),
                _ => "mods".to_string(),
            };

            let active = match disk_zip.location.as_str() {
                "disabled" => false,
                "staging" => false,
                "unpacked" => true,
                _ => db_entry
                    .and_then(|e| e.get("active"))
                    .and_then(|a| a.as_bool())
                    .unwrap_or(true),
            };

            let mut title = prettify_mod_name(&disk_zip.filename);
            let mut author = String::from("Unknown Author");
            let mut version = String::from("1.0");
            let mut tag_id: Option<String> = None;
            let mut resource_id: Option<u64> = None;
            let mut category = String::from("other");
            let mut last_update: Option<u64> = None;
            let mut icon_url: Option<String> = None;
            let mut newly_cached: Option<(String, CachedModMeta)> = None;

            let matched_cache = cached_snapshot.get(&mod_id).filter(|c| {
                (disk_zip.location == "unpacked" || c.size_bytes == Some(disk_zip.size_bytes))
                    && c.modified_ts == Some(disk_zip.modified_ts)
            });

            if let Some(entry) = db_entry {
                if let Some(mt) = entry.get("modType").and_then(|v| v.as_str()) {
                    category = normalize_mod_category(mt);
                }
                if let Some(md) = entry.get("modData") {
                    if let Some(t) = md.get("title").and_then(|v| v.as_str()).filter(|s| !s.trim().is_empty()) { title = decode_mod_text(t.trim()); }
                    if let Some(u) = md.get("username").and_then(|v| v.as_str()).filter(|s| !s.trim().is_empty()) { author = normalize_author(&decode_mod_text(u.trim())); }
                    if let Some(ver) = md.get("version_string").and_then(|v| v.as_str()).filter(|s| !s.trim().is_empty()) { version = ver.trim().to_string(); }
                    if let Some(tid) = md.get("tagid").and_then(|v| v.as_str()).filter(|s| !s.trim().is_empty()) { tag_id = Some(tid.trim().to_string()); }
                    if let Some(rid) = md.get("resource_id").and_then(|v| v.as_u64()) { resource_id = Some(rid); }
                    if let Some(lu) = md.get("last_update").and_then(|v| v.as_u64()) { last_update = Some(lu); }
                }
                if tag_id.is_none() {
                    if let Some(tid) = entry.get("modID").and_then(|v| v.as_str()) {
                        tag_id = Some(tid.to_string());
                    }
                }

                if let Some(cached) = matched_cache {
                    icon_url = cached.icon_url.clone();
                    if author == "Unknown Author" && !cached.author.is_empty() {
                        author = normalize_author(&cached.author);
                    }
                    if !cached.version.trim().is_empty() {
                        version = cached.version.trim().to_string();
                    }
                    if tag_id.is_none() {
                        tag_id = cached.tag_id.clone();
                    }
                    if resource_id.is_none() {
                        resource_id = cached.resource_id;
                    }
                } else {
                    if let Some(meta) = inspect_disk_item_meta(&disk_zip) {
                        icon_url = meta.icon_url.clone();
                        if !meta.version.trim().is_empty() {
                            version = meta.version.trim().to_string();
                        }
                        if tag_id.is_none() {
                            tag_id = meta.tag_id;
                        }
                        if resource_id.is_none() {
                            resource_id = meta.resource_id;
                        }
                        if author == "Unknown Author" && !meta.author.trim().is_empty() {
                            author = normalize_author(&meta.author);
                        }
                    }
                    newly_cached = Some((
                        mod_id.clone(),
                        CachedModMeta {
                            title: title.clone(),
                            author: author.clone(),
                            version: version.clone(),
                            tag_id: tag_id.clone(),
                            resource_id,
                            category: category.clone(),
                            last_update,
                            icon_url: icon_url.clone(),
                            size_bytes: Some(disk_zip.size_bytes),
                            modified_ts: Some(disk_zip.modified_ts),
                        },
                    ));
                }
            } else if let Some(cached) = matched_cache {
                title = cached.title.clone();
                author = normalize_author(&cached.author);
                version = cached.version.clone();
                tag_id = cached.tag_id.clone();
                resource_id = cached.resource_id;
                category = cached.category.clone();
                last_update = cached.last_update;
                icon_url = cached.icon_url.clone();
            } else if let Some(mut meta) = inspect_disk_item_meta(&disk_zip) {
                meta.author = normalize_author(&meta.author);
                meta.size_bytes = Some(disk_zip.size_bytes);
                meta.modified_ts = Some(disk_zip.modified_ts);
                title = meta.title.clone();
                author = meta.author.clone();
                version = meta.version.clone();
                tag_id = meta.tag_id.clone();
                resource_id = meta.resource_id;
                category = meta.category.clone();
                last_update = meta.last_update;
                icon_url = meta.icon_url.clone();
                newly_cached = Some((mod_id.clone(), meta));
            }

            let date_added = db_entry
                .and_then(|e| e.get("dateAdded"))
                .and_then(|d| d.as_u64())
                .unwrap_or(disk_zip.modified_ts);

            let pinned = pinned_set.contains(&mod_id);
            let subscribed = tag_id.as_deref().and_then(crate::bridge_client::is_tag_subscribed);

            let local_mod = LocalMod {
                id: mod_id, filename: disk_zip.filename, full_path: disk_zip.full_path.to_string_lossy().to_string(),
                origin_dir, location: disk_zip.location, active, pinned,
                title: decode_mod_text(&title), author: decode_mod_text(&author), version,
                tag_id, resource_id, category, size_bytes: disk_zip.size_bytes, date_added, last_update, icon_url,
                has_update: false, latest_version: None, latest_slug: None, subscribed,
            };

            (local_mod, newly_cached)
        })
        .collect();

    let mut mods = Vec::with_capacity(results.len());
    let mut state_dirty = false;
    for (m, cached_opt) in results {
        if let Some((k, v)) = cached_opt {
            state.cached_metadata.insert(k, v);
            state_dirty = true;
        }
        mods.push(m);
    }

    if state_dirty {
        let _ = save_manager_state(&config.user_path, &state);
    }
    crate::repo_client::update_checker::apply_cached_updates(&mut mods);

    mods.sort_by(|a, b| {
        b.pinned
            .cmp(&a.pinned)
            .then_with(|| a.title.to_lowercase().cmp(&b.title.to_lowercase()))
    });

    if let Ok(mut cache) = LOCAL_MODS_CACHE.lock() {
        *cache = Some((Instant::now(), mods.clone()));
    }
    watcher::record_signature(config);
    Ok(mods)
}
