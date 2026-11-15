use super::parser::{annotate_install_status, parse_mod_details_html, BASE_URL};
use super::{cooldown_remaining, fetch_repo_mod_details, fetch_text_with_retry, rate_limit_wait, trigger_rate_limit_cooldown, DETAIL_CACHE, HTTP_CLIENT, ID_RE, REPO_CACHE};
use crate::beamng_env::detect_beamng_config;
use crate::models::{BeamNGConfig, CatalogHydrateTarget, LocalMod, RepoModDetails, RepoModItem, RepoPageResponse};
use flate2::read::GzDecoder;
use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::{collections::{HashMap, HashSet}, fs, io::Read, path::Path, sync::{atomic::{AtomicU64, Ordering}, Mutex}, time::{Duration, Instant, SystemTime, UNIX_EPOCH}};

const SITEMAP_URL: &str = "https://www.beamng.com/sitemap.php?c=1";
const CATALOG_TTL_SECS: u64 = 86_400;
const META_TTL_SECS: u64 = 604_800;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatalogEntry { pub resource_id: u64, pub slug: String, pub lastmod: String }
#[derive(Debug, Clone, Serialize, Deserialize)]
struct CatalogDiskCache { fetched_at: u64, entries: Vec<CatalogEntry> }

static HYDRATE_GEN: AtomicU64 = AtomicU64::new(0);
static CATALOG_CACHE: Lazy<Mutex<Option<(u64, Vec<CatalogEntry>)>>> = Lazy::new(|| Mutex::new(None));
static SEARCH_META_CACHE: Lazy<Mutex<HashMap<u64, (u64, RepoModItem)>>> = Lazy::new(|| Mutex::new(HashMap::new()));
static META_LOADED: Lazy<Mutex<bool>> = Lazy::new(|| Mutex::new(false));
static SITEMAP_LOC_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"<loc>\s*https?://(?:www\.)?beamng\.com/resources/([^/<>]+)\.(\d+)/?\s*</loc>").unwrap());
static LASTMOD_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"<lastmod>\s*([^<]+?)\s*</lastmod>").unwrap());

pub fn bump_hydrate_generation() { HYDRATE_GEN.fetch_add(1, Ordering::SeqCst); }
fn now_secs() -> u64 { SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0) }

pub(crate) fn catalog_memory_cache_count() -> usize {
    CATALOG_CACHE.lock().ok().and_then(|g| g.as_ref().map(|(_, v)| v.len())).unwrap_or(0)
        + SEARCH_META_CACHE.lock().map(|g| g.len()).unwrap_or(0)
}

pub(crate) fn clear_catalog_caches() -> usize {
    let mut cleared = 0;
    if let Ok(mut g) = CATALOG_CACHE.lock() { if let Some((_, v)) = g.take() { cleared += v.len(); } }
    if let Ok(mut g) = SEARCH_META_CACHE.lock() { cleared += g.len(); g.clear(); }
    if let Ok(mut m) = META_LOADED.lock() { *m = false; }
    cleared
}

fn ensure_meta_cache_loaded(config: &BeamNGConfig) {
    let Ok(mut loaded) = META_LOADED.lock() else { return };
    if *loaded { return; }
    *loaded = true;
    let Ok(raw) = fs::read_to_string(Path::new(&config.user_path).join("modmanager_repo_meta.json")) else { return };
    let Ok(parsed) = serde_json::from_str::<HashMap<u64, (u64, RepoModItem)>>(&raw) else { return };
    let cutoff = now_secs().saturating_sub(META_TTL_SECS);
    if let Ok(mut guard) = SEARCH_META_CACHE.lock() {
        for (rid, (ts, item)) in parsed { if ts >= cutoff { guard.entry(rid).or_insert((ts, item)); } }
    }
}

fn save_meta_cache(config: &BeamNGConfig) {
    let cutoff = now_secs().saturating_sub(META_TTL_SECS);
    let Ok(mut guard) = SEARCH_META_CACHE.lock() else { return };
    guard.retain(|_, (ts, _)| *ts >= cutoff);
    if let Ok(json) = serde_json::to_string(&*guard) {
        let _ = fs::write(Path::new(&config.user_path).join("modmanager_repo_meta.json"), json);
    }
}

fn parse_sitemap_xml(xml: &str) -> Vec<CatalogEntry> {
    let mut entries = Vec::new();
    let mut seen = HashSet::new();
    for block in xml.split("</url>") {
        let Some(caps) = SITEMAP_LOC_RE.captures(block) else { continue };
        let loc = caps.get(0).map(|m| m.as_str()).unwrap_or_default();
        if ["/categories/", "/authors/", "/updates", "/reviews", "/history"].iter().any(|p| loc.contains(p)) { continue; }
        let (Some(slug_m), Some(rid)) = (caps.get(1), caps.get(2).and_then(|m| m.as_str().parse::<u64>().ok())) else { continue };
        if rid == 0 || !seen.insert(rid) { continue; }
        let lastmod = LASTMOD_RE.captures(block).and_then(|c| c.get(1)).map(|m| m.as_str().trim().to_string()).unwrap_or_default();
        entries.push(CatalogEntry { resource_id: rid, slug: format!("{}.{}", slug_m.as_str(), rid), lastmod });
    }
    entries
}

pub async fn get_or_fetch_catalog(config: &BeamNGConfig, force_refresh: bool) -> Result<Vec<CatalogEntry>, String> {
    let now = now_secs();
    let path = Path::new(&config.user_path).join("modmanager_repo_catalog.json");
    let disk_cache = fs::read_to_string(&path).ok().and_then(|r| serde_json::from_str::<CatalogDiskCache>(&r).ok());

    if !force_refresh {
        if let Ok(guard) = CATALOG_CACHE.lock() {
            if let Some((ts, ref entries)) = *guard {
                if now.saturating_sub(ts) < CATALOG_TTL_SECS && !entries.is_empty() { return Ok(entries.clone()); }
            }
        }
        if let Some(ref disk) = disk_cache {
            if now.saturating_sub(disk.fetched_at) < CATALOG_TTL_SECS && !disk.entries.is_empty() {
                if let Ok(mut guard) = CATALOG_CACHE.lock() { *guard = Some((disk.fetched_at, disk.entries.clone())); }
                return Ok(disk.entries.clone());
            }
        }
    }

    let stale = disk_cache.filter(|d| !d.entries.is_empty()).map(|d| d.entries);
    let fallback = |msg: String| -> Result<Vec<CatalogEntry>, String> { stale.clone().ok_or(msg) };

    rate_limit_wait().await;
    let resp = match HTTP_CLIENT.get(SITEMAP_URL).timeout(Duration::from_secs(45)).send().await {
        Ok(r) => r,
        Err(e) => {
            let msg = format!("BeamNG catalog fetch error: {}", e);
            super::web_status::record_web_error("network", None, msg.clone());
            return fallback(msg);
        }
    };
    let code = resp.status().as_u16();
    if code == 403 || code == 429 || code == 503 {
        trigger_rate_limit_cooldown();
        let msg = "BeamNG Repository rate limit reached. Cooling down for 15 seconds...".to_string();
        super::web_status::record_web_error("rate_limit", Some(code), msg.clone());
        return fallback(msg);
    }
    if !resp.status().is_success() {
        let msg = format!("BeamNG catalog server error: HTTP {}", code);
        super::web_status::record_web_error("http_error", Some(code), msg.clone());
        return fallback(msg);
    }

    let bytes = resp.bytes().await.map_err(|e| {
        let msg = format!("Failed to read catalog: {}", e);
        super::web_status::record_web_error("network", None, msg.clone());
        msg
    })?;
    let xml = if bytes.starts_with(&[0x1f, 0x8b]) {
        let mut out = String::new();
        GzDecoder::new(&bytes[..]).read_to_string(&mut out).map_err(|e| format!("Failed to decompress catalog: {}", e))?;
        out
    } else { String::from_utf8_lossy(&bytes).into_owned() };

    if xml.contains("<title>CrowdSec") || xml.contains("CrowdSec Challenge") {
        trigger_rate_limit_cooldown();
        let msg = "BeamNG Repository protection challenge triggered. Cooling down for 15 seconds...".to_string();
        super::web_status::record_web_error("crowdsec", Some(code), msg.clone());
        return fallback(msg);
    }
    let entries = parse_sitemap_xml(&xml);
    if entries.is_empty() { return fallback("BeamNG catalog returned no mod entries".to_string()); }
    super::web_status::record_web_ok();
    if let Ok(json) = serde_json::to_string(&CatalogDiskCache { fetched_at: now, entries: entries.clone() }) { let _ = fs::write(&path, json); }
    if let Ok(mut guard) = CATALOG_CACHE.lock() { *guard = Some((now, entries.clone())); }
    Ok(entries)
}

fn format_slug_title(slug: &str) -> String {
    let base = slug.rsplit_once('.').map(|(s, _)| s).unwrap_or(slug);
    let title: String = base.replace(['-', '_'], " ").split_whitespace().map(|w| {
        let mut c = w.chars();
        c.next().map(|f| format!("{}{}", f.to_uppercase(), c.as_str())).unwrap_or_default()
    }).collect::<Vec<_>>().join(" ");
    if title.is_empty() { "BeamNG Mod".to_string() } else { title }
}

fn details_to_item(d: &RepoModDetails, updated_text: String) -> RepoModItem {
    RepoModItem {
        resource_id: d.resource_id, slug: d.slug.clone(), title: d.title.clone(), version: d.version.clone(),
        author: d.author.clone(), tagline: d.tagline.clone(), category: d.category.clone(), rating: d.rating,
        rating_count: 0, downloads: d.downloads, subscriptions: 0, updated_text, updated_timestamp: 0,
        icon_url: d.icon_url.clone(), install_status: d.install_status.clone(),
        installed_version: d.installed_version.clone(), local_mod_id: None, hydrated: true,
        tag_id: d.tag_id.clone(), subscribed: d.subscribed,
    }
}

fn category_matches_known(item_cat: &str, filter_cat: &str) -> bool {
    let c = item_cat.trim().to_lowercase();
    if filter_cat.is_empty() || filter_cat == "all" || matches!(c.as_str(), "" | "mod" | "official repo" | "other") { return true; }
    match filter_cat {
        "vehicles.2" => c.contains("vehicle") || c.contains("car") || c.contains("truck"),
        "terrains-levels-maps.9" => c.contains("terrain") || c.contains("level") || c.contains("map"),
        "scenarios.8" => c.contains("scenario") || c.contains("mission"),
        "user-interface-apps.10" => c.contains("app") || c.contains("interface") || c.contains("ui"),
        "sounds.13" => c.contains("sound") || c.contains("audio"),
        "mods-of-mods.7" => c.contains("mods of mods") || c.contains("mod"),
        "skins.12" => c.contains("skin") || c.contains("livery"),
        "automation.16" => c.contains("automation"),
        _ => true,
    }
}

pub async fn search_global_catalog(
    config: &BeamNGConfig, category: &str, sort_by: &str, page: u32, per_page: u32,
    query_lower: &str, force_refresh: bool, local_mods: &[LocalMod],
) -> Result<RepoPageResponse, String> {
    if let Some(rid) = ID_RE.captures(query_lower).and_then(|c| c.get(1)).and_then(|m| m.as_str().parse::<u64>().ok()) {
        if let Ok(d) = fetch_repo_mod_details(format!("resources/{}/", rid), rid).await {
            let mut items = vec![details_to_item(&d, "Direct ID".to_string())];
            annotate_install_status(&mut items, local_mods);
            return Ok(RepoPageResponse { items, current_page: 1, total_pages: 1, repo_source: Some("global_catalog".to_string()) });
        }
    }

    ensure_meta_cache_loaded(config);
    let catalog = get_or_fetch_catalog(config, force_refresh).await?;
    let mut known: HashMap<u64, RepoModItem> = HashMap::new();
    if let Ok(meta) = SEARCH_META_CACHE.lock() { for (&rid, (_, item)) in meta.iter() { known.insert(rid, item.clone()); } }
    if let Ok(repo) = REPO_CACHE.lock() { for (items, _, _) in repo.values() { for i in items { known.insert(i.resource_id, i.clone()); } } }
    if let Ok(det) = DETAIL_CACHE.lock() { for (&rid, (d, _)) in det.iter() { known.entry(rid).or_insert_with(|| details_to_item(d, "Official Repo".to_string())); } }

    let local_by_rid: HashMap<u64, &LocalMod> = local_mods.iter().filter_map(|m| m.resource_id.map(|r| (r, m))).collect();
    let tokens: Vec<&str> = query_lower.split_whitespace().filter(|t| !t.is_empty()).collect();
    let mut scored: Vec<(u64, &CatalogEntry, Option<RepoModItem>)> = Vec::new();

    for entry in &catalog {
        let cached = known.get(&entry.resource_id).cloned();
        let lm = local_by_rid.get(&entry.resource_id).copied();
        let known_cat = cached.as_ref().map(|i| i.category.as_str()).or_else(|| lm.map(|m| m.category.as_str()));
        if let Some(kc) = known_cat { if !category_matches_known(kc, category) { continue; } }

        let slug_space = entry.slug.rsplit_once('.').map(|(a, _)| a).unwrap_or(&entry.slug).replace(['-', '_'], " ").to_lowercase();
        let title_lower = cached.as_ref().map(|i| i.title.to_lowercase()).or_else(|| lm.map(|m| m.title.to_lowercase())).unwrap_or_else(|| slug_space.clone());
        let extra = cached.as_ref().map(|i| format!("{} {} {}", i.author, i.tagline, i.category).to_lowercase())
            .or_else(|| lm.map(|m| format!("{} {}", m.author, m.category).to_lowercase())).unwrap_or_default();
        let hay = format!("{} {} {} {}", slug_space, title_lower, extra, entry.resource_id);
        if !tokens.iter().all(|t| hay.contains(t)) { continue; }

        let mut score: u64 = if title_lower == query_lower || slug_space == query_lower { 1010 }
            else if title_lower.starts_with(query_lower) || slug_space.starts_with(query_lower) { 410 }
            else if title_lower.contains(query_lower) || slug_space.contains(query_lower) { 210 }
            else { 10 };
        for t in &tokens {
            if slug_space.split_whitespace().any(|w| w == *t) || title_lower.split_whitespace().any(|w| w == *t) { score += 50; }
        }
        if cached.is_some() { score += 5; }
        scored.push((score, entry, cached));
    }

    scored.sort_by(|(sa, ea, ca), (sb, eb, cb)| {
        let (ba, bb) = (sa / 100, sb / 100);
        match sort_by {
            "download_count" => bb.cmp(&ba).then_with(|| cb.as_ref().map(|i| i.downloads).unwrap_or(0).cmp(&ca.as_ref().map(|i| i.downloads).unwrap_or(0))).then_with(|| sb.cmp(sa)),
            "rating_weighted" => bb.cmp(&ba).then_with(|| ((cb.as_ref().map(|i| i.rating).unwrap_or(0.0) * 100.0) as u64).cmp(&((ca.as_ref().map(|i| i.rating).unwrap_or(0.0) * 100.0) as u64))).then_with(|| sb.cmp(sa)),
            "resource_date" => bb.cmp(&ba).then_with(|| eb.resource_id.cmp(&ea.resource_id)),
            _ => sb.cmp(sa).then_with(|| eb.lastmod.cmp(&ea.lastmod)).then_with(|| eb.resource_id.cmp(&ea.resource_id)),
        }
    });

    let per_page = per_page.clamp(1, 50);
    let total_pages = ((scored.len() as u32).saturating_add(per_page - 1) / per_page).max(1);
    let current_page = page.max(1).min(total_pages);
    let start = ((current_page - 1) as usize).saturating_mul(per_page as usize);
    let end = (start + per_page as usize).min(scored.len());
    let mut items: Vec<RepoModItem> = scored.get(start..end).unwrap_or(&[]).iter().map(|(_, entry, cached)| {
        cached.clone().unwrap_or_else(|| RepoModItem {
            resource_id: entry.resource_id, slug: format!("resources/{}/", entry.slug), title: format_slug_title(&entry.slug),
            version: String::new(), author: "BeamNG Repository".to_string(), tagline: String::new(), category: "Mod".to_string(),
            rating: 0.0, rating_count: 0, downloads: 0, subscriptions: 0, updated_text: "Repo Catalog".to_string(),
            updated_timestamp: 0, icon_url: String::new(), install_status: "not_installed".to_string(),
            installed_version: None, local_mod_id: None, hydrated: false, tag_id: None, subscribed: None,
        })
    }).collect();
    annotate_install_status(&mut items, local_mods);
    Ok(RepoPageResponse { items, current_page, total_pages, repo_source: Some("global_catalog".to_string()) })
}
pub async fn hydrate_repo_items(targets: Vec<CatalogHydrateTarget>) -> Result<Vec<RepoModItem>, String> {
    let my_gen = HYDRATE_GEN.load(Ordering::SeqCst);
    let mut seen = HashSet::new();
    let capped: Vec<CatalogHydrateTarget> = targets.into_iter().filter(|t| t.resource_id > 0 && seen.insert(t.resource_id)).take(12).collect();
    if capped.is_empty() { return Ok(Vec::new()); }
    let config = detect_beamng_config()?;
    if crate::bridge_client::is_bridge_enabled(&config) { crate::bridge_client::ensure_subscribed_tags_loaded(&config).await; }
    ensure_meta_cache_loaded(&config);
    let local_mods = crate::local_mods::get_cached_or_list_local_mods(&config).unwrap_or_default();
    let (now, cutoff) = (now_secs(), now_secs().saturating_sub(META_TTL_SECS));
    let (mut results, mut meta_dirty) = (Vec::new(), false);
    for t in capped {
        if HYDRATE_GEN.load(Ordering::SeqCst) != my_gen || cooldown_remaining().is_some() { break; }
        if let Some(item) = SEARCH_META_CACHE.lock().ok().and_then(|g| g.get(&t.resource_id).filter(|(ts, _)| *ts >= cutoff).map(|(_, i)| i.clone())) {
            results.push(item); continue;
        }
        if let Some(d) = DETAIL_CACHE.lock().ok().and_then(|g| g.get(&t.resource_id).filter(|(_, ts)| ts.elapsed() < Duration::from_secs(600)).map(|(d, _)| d.clone())) {
            let item = details_to_item(&d, "Official Repo".to_string());
            if let Ok(mut m) = SEARCH_META_CACHE.lock() { m.insert(item.resource_id, (now, item.clone())); meta_dirty = true; }
            results.push(item); continue;
        }
        let clean = t.slug.trim().trim_matches('/');
        let rel_slug = if clean.is_empty() { format!("resources/{}/", t.resource_id) } else if clean.starts_with("resources/") { format!("{}/", clean) } else { format!("resources/{}/", clean) };
        let Ok(html) = fetch_text_with_retry(&format!("{}{}", BASE_URL, rel_slug)).await else {
            if cooldown_remaining().is_some() { break; }
            continue;
        };
        let (details, resolved_id) = parse_mod_details_html(&html, &rel_slug, t.resource_id);
        let cache_id = if resolved_id > 0 { resolved_id } else { t.resource_id };
        let date = details.recent_updates.first().map(|u| u.date_text.clone()).filter(|s| !s.is_empty()).unwrap_or_else(|| "Official Repo".to_string());
        let item = details_to_item(&details, date);
        if let Ok(mut dc) = DETAIL_CACHE.lock() { dc.insert(cache_id, (details.clone(), Instant::now())); }
        if let Ok(mut mc) = SEARCH_META_CACHE.lock() { mc.insert(cache_id, (now, item.clone())); meta_dirty = true; }
        super::update_checker::record_remote_version(cache_id, &details.version, &details.slug);
        results.push(item);
    }
    if meta_dirty { save_meta_cache(&config); }
    annotate_install_status(&mut results, &local_mods);
    Ok(results)
}
