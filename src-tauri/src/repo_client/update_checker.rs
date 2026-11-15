use super::parser::{parse_updates_page_html, BASE_URL};
use crate::beamng_env::detect_beamng_config;
use crate::local_mods::list_local_mods;
use crate::models::{LocalMod, ModUpdateEntry};
use futures_util::future::join_all;
use once_cell::sync::Lazy;
use regex::Regex;
use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use std::time::{Duration, Instant};

static REMOTE_VERSION_CACHE: Lazy<Mutex<HashMap<u64, (String, String)>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));
static REMOTE_TAG_VERSION_CACHE: Lazy<Mutex<HashMap<String, (String, String)>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));
static TAG_REFRESH_TS: Lazy<Mutex<HashMap<String, Instant>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));
static UPDATES_CACHE: Lazy<Mutex<HashMap<u64, (Vec<ModUpdateEntry>, Instant)>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

static VER_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"<div class="resourceInfo">[\s\S]*?<h1>[\s\S]*?<span class="muted">([^<]+)</span>"#)
        .unwrap()
});

pub(crate) fn memory_update_cache_count() -> usize {
    REMOTE_VERSION_CACHE.lock().map(|c| c.len()).unwrap_or(0)
        + REMOTE_TAG_VERSION_CACHE.lock().map(|c| c.len()).unwrap_or(0)
        + TAG_REFRESH_TS.lock().map(|c| c.len()).unwrap_or(0)
        + UPDATES_CACHE.lock().map(|c| c.len()).unwrap_or(0)
}

pub(crate) fn clear_update_caches() -> usize {
    let mut cleared = 0;
    if let Ok(mut c) = REMOTE_VERSION_CACHE.lock() { cleared += c.len(); c.clear(); }
    if let Ok(mut c) = REMOTE_TAG_VERSION_CACHE.lock() { cleared += c.len(); c.clear(); }
    if let Ok(mut c) = TAG_REFRESH_TS.lock() { cleared += c.len(); c.clear(); }
    if let Ok(mut c) = UPDATES_CACHE.lock() { cleared += c.len(); c.clear(); }
    cleared
}

/// Strips surrounding whitespace and any leading `'v'` or `'V'` prefix for version comparison.
pub fn normalize_ver(v: &str) -> &str {
    v.trim().trim_start_matches(['v', 'V']).trim()
}

/// Records the latest known remote version and canonical slug for a BeamNG resource ID.
pub fn record_remote_version(resource_id: u64, version: &str, slug: &str) {
    let trimmed = version.trim();
    if resource_id == 0 || trimmed.is_empty() {
        return;
    }
    if let Ok(mut cache) = REMOTE_VERSION_CACHE.lock() {
        cache.insert(resource_id, (trimmed.to_string(), slug.to_string()));
    }
}

/// Records the latest known remote version and canonical slug for an uppercase Bridge `tag_id`.
pub fn record_remote_tag_version(tag_id: &str, version: &str, slug: &str) {
    let key = tag_id.trim().to_ascii_uppercase();
    let trimmed = version.trim();
    if key.is_empty() || trimmed.is_empty() {
        return;
    }
    if let Ok(mut cache) = REMOTE_TAG_VERSION_CACHE.lock() {
        cache.insert(key, (trimmed.to_string(), slug.to_string()));
    }
}

/// Annotates `mods` with update flags using `REMOTE_VERSION_CACHE` and `REMOTE_TAG_VERSION_CACHE`.
pub fn apply_cached_updates(mods: &mut [LocalMod]) {
    let (Ok(ver_cache), Ok(tag_cache)) = (REMOTE_VERSION_CACHE.lock(), REMOTE_TAG_VERSION_CACHE.lock()) else { return };
    for m in mods.iter_mut() {
        let found = m.resource_id.and_then(|rid| ver_cache.get(&rid)).or_else(|| {
            m.tag_id.as_deref().map(|t| t.trim().to_ascii_uppercase()).filter(|k| !k.is_empty()).and_then(|k| tag_cache.get(&k))
        });
        if let Some((latest_ver, latest_slug)) = found {
            let norm_remote = normalize_ver(latest_ver);
            if !norm_remote.is_empty() && norm_remote != normalize_ver(&m.version) {
                m.has_update = true;
                m.latest_version = Some(latest_ver.clone());
                m.latest_slug = (!latest_slug.is_empty()).then(|| latest_slug.clone());
            } else {
                m.has_update = false;
                m.latest_version = None;
                m.latest_slug = None;
            }
        }
    }
}

fn seed_from_caches() -> HashSet<u64> {
    let mut fresh_ids = HashSet::new();
    let mut seeded: Vec<(u64, Option<String>, String, String, bool)> = Vec::new();
    if let Ok(repo_cache) = super::REPO_CACHE.lock() {
        for (items, _, ts) in repo_cache.values() {
            let fresh = ts.elapsed() < Duration::from_secs(300);
            for item in items {
                seeded.push((item.resource_id, item.tag_id.clone(), item.version.clone(), item.slug.clone(), fresh));
            }
        }
    }
    if let Ok(detail_cache) = super::DETAIL_CACHE.lock() {
        for (&rid, (details, ts)) in detail_cache.iter() {
            let fresh = ts.elapsed() < Duration::from_secs(600);
            seeded.push((rid, details.tag_id.clone(), details.version.clone(), details.slug.clone(), fresh));
        }
    }
    for (rid, tag_id, ver, slug, fresh) in seeded {
        if let Some(tid) = tag_id.as_deref() { record_remote_tag_version(tid, &ver, &slug); }
        if rid > 0 && !ver.trim().is_empty() {
            record_remote_version(rid, &ver, &slug);
            if fresh { fresh_ids.insert(rid); }
        }
    }
    fresh_ids
}

async fn fetch_single_version(rid: u64) {
    let url = format!("{}resources/{}/", BASE_URL, rid);
    let Ok(resp) = super::HTTP_CLIENT.get(&url).timeout(Duration::from_secs(20)).send().await else {
        return;
    };
    let code = resp.status().as_u16();
    if code == 429 || code == 503 {
        super::trigger_rate_limit_cooldown();
        return;
    }
    if !resp.status().is_success() {
        return;
    }
    let slug = resp.url().path().trim_start_matches('/').to_string();
    if let Ok(html) = resp.text().await {
        if let Some(ver) = VER_RE.captures(&html).and_then(|c| c.get(1)).map(|m| m.as_str().trim()) {
            record_remote_version(rid, ver, &slug);
        }
    }
}

async fn try_check_via_bridge(config: &crate::models::BeamNGConfig, mods: &[LocalMod]) -> bool {
    if !crate::bridge_client::is_bridge_enabled(config) { return false; }
    let Some(entries) = crate::bridge_client::fetch_all_subscribed_entries(config).await else { return false };

    let mut covered_tags = HashSet::new();
    for (rid_opt, tagid, ver, slug) in entries {
        let upper = tagid.trim().to_ascii_uppercase();
        if !upper.is_empty() { covered_tags.insert(upper); }
        record_remote_tag_version(&tagid, &ver, &slug);
        if let Some(rid) = rid_opt { record_remote_version(rid, &ver, &slug); }
    }

    let mut remaining_tags = Vec::new();
    for m in mods {
        if let Some(tid) = m.tag_id.as_deref().map(str::trim).filter(|t| !t.is_empty()) {
            let upper = tid.to_ascii_uppercase();
            if covered_tags.insert(upper.clone()) {
                let recently_refreshed = TAG_REFRESH_TS.lock().ok()
                    .and_then(|ts| ts.get(&upper).map(|t| t.elapsed() < Duration::from_secs(120)))
                    .unwrap_or(false);
                if !recently_refreshed { remaining_tags.push(tid.to_string()); }
            }
        }
    }
    for (idx, tid) in remaining_tags.into_iter().enumerate() {
        if idx > 0 { tokio::time::sleep(Duration::from_millis(180)).await; }
        if let Some((rid, ver, slug)) = crate::bridge_client::fetch_bridge_mod_version(config, &tid).await {
            record_remote_tag_version(&tid, &ver, &slug);
            if rid > 0 { record_remote_version(rid, &ver, &slug); }
            if let Ok(mut ts) = TAG_REFRESH_TS.lock() {
                ts.insert(tid.to_ascii_uppercase(), Instant::now());
            }
        }
    }
    true
}

/// Checks all installed mods for remote updates, preferring localhost Game Bridge when available.
pub async fn check_updates_for_installed() -> Result<Vec<LocalMod>, String> {
    let config = detect_beamng_config()?;
    let mut mods = list_local_mods(&config)?;
    let fresh_ids = seed_from_caches();

    if !try_check_via_bridge(&config, &mods).await {
        let mut seen = HashSet::new();
        let to_check: Vec<u64> = mods.iter().filter_map(|m| m.resource_id)
            .filter(|&rid| rid > 0 && !fresh_ids.contains(&rid) && seen.insert(rid))
            .collect();
        for (idx, chunk) in to_check.chunks(4).enumerate() {
            if idx > 0 { tokio::time::sleep(Duration::from_millis(150)).await; }
            if let Some(dur) = super::cooldown_remaining() { tokio::time::sleep(dur).await; }
            join_all(chunk.iter().copied().map(fetch_single_version)).await;
        }
    }

    apply_cached_updates(&mut mods);
    crate::local_mods::invalidate_local_mods_cache();
    Ok(mods)
}

async fn fetch_updates_html_quiet(url: &str) -> Result<String, String> {
    if let Some(d) = super::cooldown_remaining() {
        return Err(format!("Web rate limit cooldown ({}s remaining)", d.as_secs().max(1)));
    }
    super::rate_limit_wait().await;
    let resp = super::HTTP_CLIENT.get(url).timeout(Duration::from_secs(20)).send().await
        .map_err(|e| format!("Changelog request failed: {}", e))?;
    let code = resp.status().as_u16();
    if code == 403 || code == 429 || code == 503 {
        super::trigger_rate_limit_cooldown();
        return Err("BeamNG Repository rate limit reached. Cooling down for 15 seconds...".to_string());
    }
    if !resp.status().is_success() {
        return Err(format!("Changelog unavailable: HTTP {}", code));
    }
    let html = resp.text().await.map_err(|e| format!("Failed to read changelog: {}", e))?;
    if html.contains("CrowdSec Challenge") || html.contains("<title>CrowdSec") {
        super::trigger_rate_limit_cooldown();
        return Err("BeamNG Repository protection challenge triggered. Cooling down for 15 seconds...".to_string());
    }
    Ok(html)
}

/// Fetches and caches (60m TTL) the changelog entries without blocking on cooldown or poisoning web status.
pub async fn fetch_repo_mod_updates(slug: String, resource_id: u64) -> Result<Vec<ModUpdateEntry>, String> {
    if resource_id == 0 { return Ok(vec![]); }
    if let Some((cached, ts)) = UPDATES_CACHE.lock().ok().and_then(|c| c.get(&resource_id).cloned()) {
        if ts.elapsed() < Duration::from_secs(3600) {
            return Ok(cached);
        }
    }
    let raw = slug.trim().trim_matches('/');
    let clean_slug = if raw.is_empty() || raw.starts_with("bridge/") {
        format!("resources/{}", resource_id)
    } else {
        raw.split('?').next().unwrap_or(raw).trim_end_matches('/').to_string()
    };
    let html = fetch_updates_html_quiet(&format!("{}{}/updates", BASE_URL, clean_slug)).await?;
    let entries = parse_updates_page_html(&html);
    if let Ok(mut cache) = UPDATES_CACHE.lock() { cache.insert(resource_id, (entries.clone(), Instant::now())); }
    if let Ok(mut detail_cache) = super::DETAIL_CACHE.lock() {
        if let Some((details, _)) = detail_cache.get_mut(&resource_id) {
            details.recent_updates = entries.clone();
        }
    }
    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mock_mod(id: &str, ver: &str, rid: Option<u64>, tag_id: Option<&str>) -> LocalMod {
        LocalMod {
            id: id.to_string(), filename: format!("{}.zip", id), full_path: String::new(),
            origin_dir: "mods/repo/".to_string(), location: "repo".to_string(), active: true,
            pinned: false, title: id.to_string(), author: "Tester".to_string(), version: ver.to_string(),
            tag_id: tag_id.map(str::to_string), resource_id: rid, category: "Mod".to_string(),
            size_bytes: 1024, date_added: 0, last_update: None, icon_url: None,
            has_update: false, latest_version: None, latest_slug: None, subscribed: None,
        }
    }

    #[test]
    fn apply_cached_updates_matches_resource_id_tag_id_and_normalizes_v() {
        record_remote_version(999_001_001, "v2.0", "resources/999001001/");
        record_remote_tag_version("TEST_TAG_UPDATE_01", "1.5", "bridge/TEST_TAG_UPDATE_01");
        record_remote_tag_version("TEST_TAG_NORM_02", "v1.0", "bridge/TEST_TAG_NORM_02");

        let mut mods = vec![
            mock_mod("rid_mod", "1.0", Some(999_001_001), None),
            mock_mod("tag_mod", "1.2", None, Some("test_tag_update_01")),
            mock_mod("norm_mod", "1.0", None, Some("TEST_TAG_NORM_02")),
        ];
        apply_cached_updates(&mut mods);

        assert!(mods[0].has_update);
        assert_eq!(mods[0].latest_version.as_deref(), Some("v2.0"));
        assert_eq!(mods[0].latest_slug.as_deref(), Some("resources/999001001/"));

        assert!(mods[1].has_update);
        assert_eq!(mods[1].latest_version.as_deref(), Some("1.5"));
        assert_eq!(mods[1].latest_slug.as_deref(), Some("bridge/TEST_TAG_UPDATE_01"));

        assert!(!mods[2].has_update);
        assert_eq!(mods[2].latest_version, None);
    }
}
