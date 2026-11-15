pub mod catalog_search;
pub mod download_manager;
pub mod download_throttle;
pub mod downloader;
pub mod parser;
pub mod update_checker;
pub mod web_status;

pub use catalog_search::hydrate_repo_items;
pub use update_checker::{check_updates_for_installed, fetch_repo_mod_updates};
pub use web_status::current_web_status;
use parser::{annotate_install_status, build_listing_url, parse_mod_details_html, parse_resource_list_html, parse_updates_page_html, BASE_URL};
use crate::beamng_env::detect_beamng_config;
use crate::models::{LocalMod, RepoModDetails, RepoModItem, RepoPageResponse};
use once_cell::sync::Lazy;
use regex::Regex;
use reqwest::header::{HeaderMap, HeaderValue, USER_AGENT};
use std::{collections::{HashMap, VecDeque}, sync::Mutex, time::{Duration, Instant}};

const BROWSER_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

pub(crate) static HTTP_CLIENT: Lazy<reqwest::Client> = Lazy::new(|| {
    let mut headers = HeaderMap::new();
    headers.insert(USER_AGENT, HeaderValue::from_static(BROWSER_UA));
    reqwest::Client::builder().default_headers(headers).cookie_store(true).connect_timeout(Duration::from_secs(20)).build().expect("Failed to build HTTP client")
});

pub(super) static ID_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?:resources/(?:[^/]+\.)?|^)(\d{3,7})/?$").unwrap());
static COOLDOWN_UNTIL: Lazy<Mutex<Option<Instant>>> = Lazy::new(|| Mutex::new(None));

pub(crate) fn cooldown_remaining() -> Option<Duration> {
    COOLDOWN_UNTIL.lock().ok().and_then(|mut g| {
        let t = (*g)?;
        let now = Instant::now();
        if now < t { Some(t - now) } else { *g = None; None }
    })
}

pub(crate) fn trigger_rate_limit_cooldown() {
    if let Ok(mut cd) = COOLDOWN_UNTIL.lock() { *cd = Some(Instant::now() + Duration::from_secs(15)); }
}

pub(crate) fn reset_web_state() {
    if let Ok(mut cd) = COOLDOWN_UNTIL.lock() { *cd = None; }
    web_status::reset_web_status();
}

static REQ_TIMESTAMPS: Lazy<tokio::sync::Mutex<VecDeque<Instant>>> = Lazy::new(|| tokio::sync::Mutex::new(VecDeque::new()));

pub(crate) async fn rate_limit_wait() {
    loop {
        if let Some(dur) = cooldown_remaining() { tokio::time::sleep(dur).await; continue; }
        let mut ts = REQ_TIMESTAMPS.lock().await;
        let now = Instant::now();
        while let Some(&front) = ts.front() {
            if now.duration_since(front) >= Duration::from_secs(60) { ts.pop_front(); } else { break; }
        }
        let win_wait = if ts.len() >= 30 {
            ts.front().map(|&f| now.duration_since(f)).filter(|&d| d < Duration::from_secs(60)).map(|d| Duration::from_secs(60) - d)
        } else { None };
        let gap_wait = ts.back().map(|&b| now.duration_since(b)).filter(|&d| d < Duration::from_millis(450)).map(|d| Duration::from_millis(450) - d);
        if let Some(dur) = match (win_wait, gap_wait) { (Some(w), Some(g)) => Some(w.max(g)), (w, g) => w.or(g) } {
            drop(ts);
            tokio::time::sleep(dur).await;
            continue;
        }
        ts.push_back(Instant::now());
        break;
    }
}

pub(super) static REPO_CACHE: Lazy<Mutex<HashMap<String, (Vec<RepoModItem>, u32, Instant)>>> = Lazy::new(|| Mutex::new(HashMap::new()));
static BRIDGE_CACHE: Lazy<Mutex<HashMap<String, (Vec<RepoModItem>, u32, Instant)>>> = Lazy::new(|| Mutex::new(HashMap::new()));
pub(super) static DETAIL_CACHE: Lazy<Mutex<HashMap<u64, (RepoModDetails, Instant)>>> = Lazy::new(|| Mutex::new(HashMap::new()));

pub fn clear_bridge_caches() {
    if let Ok(mut c) = BRIDGE_CACHE.lock() { c.clear(); }
    if let Ok(mut c) = DETAIL_CACHE.lock() { c.clear(); }
}

pub(crate) fn memory_repo_cache_count() -> usize {
    REPO_CACHE.lock().map(|c| c.len()).unwrap_or(0)
        + BRIDGE_CACHE.lock().map(|c| c.len()).unwrap_or(0)
        + DETAIL_CACHE.lock().map(|c| c.len()).unwrap_or(0)
        + catalog_search::catalog_memory_cache_count()
}

pub(crate) fn clear_repo_memory_caches() -> usize {
    let mut cleared = 0;
    if let Ok(mut c) = REPO_CACHE.lock() { cleared += c.len(); c.clear(); }
    if let Ok(mut c) = BRIDGE_CACHE.lock() { cleared += c.len(); c.clear(); }
    if let Ok(mut c) = DETAIL_CACHE.lock() { cleared += c.len(); c.clear(); }
    cleared += catalog_search::clear_catalog_caches();
    cleared += update_checker::clear_update_caches();
    reset_web_state();
    cleared
}

fn fail_web(kind: &str, code: Option<u16>, msg: String) -> String {
    web_status::record_web_error(kind, code, msg.clone());
    msg
}

pub(super) async fn fetch_text_with_retry(url: &str) -> Result<String, String> {
    for attempt in 0..2 {
        rate_limit_wait().await;
        match HTTP_CLIENT.get(url).timeout(Duration::from_secs(30)).send().await {
            Ok(resp) => {
                let code = resp.status().as_u16();
                if code == 403 || code == 429 || code == 503 {
                    trigger_rate_limit_cooldown();
                    return Err(fail_web("rate_limit", Some(code), "BeamNG Repository rate limit reached. Cooling down for 15 seconds...".into()));
                }
                if resp.status().is_success() {
                    let html = resp.text().await.map_err(|e| fail_web("network", None, format!("Failed to read response: {}", e)))?;
                    if html.contains("CrowdSec Challenge") || html.contains("<title>CrowdSec") {
                        trigger_rate_limit_cooldown();
                        return Err(fail_web("crowdsec", Some(code), "BeamNG Repository protection challenge triggered. Cooling down for 15 seconds...".into()));
                    }
                    web_status::record_web_ok();
                    return Ok(html);
                }
                if attempt == 1 || code < 500 {
                    return Err(fail_web("http_error", Some(code), format!("BeamNG Repo server error: HTTP {}", code)));
                }
            }
            Err(e) if attempt == 1 => return Err(fail_web("network", None, format!("BeamNG Repo connection error: {}", e))),
            Err(_) => {}
        }
    }
    Err(fail_web("network", None, "BeamNG Repo request failed".into()))
}

fn cache_detail_entry(cache_id: u64, details: &RepoModDetails) {
    if cache_id == 0 { return; }
    if let Ok(mut cache) = DETAIL_CACHE.lock() { cache.insert(cache_id, (details.clone(), Instant::now())); }
    update_checker::record_remote_version(cache_id, &details.version, &details.slug);
}

fn details_to_item(d: RepoModDetails) -> RepoModItem {
    RepoModItem {
        resource_id: d.resource_id, slug: d.slug, title: d.title, version: d.version,
        author: d.author, tagline: d.tagline, category: d.category, rating: d.rating,
        rating_count: 0, downloads: d.downloads, subscriptions: 0,
        updated_text: "Recent".into(), updated_timestamp: 0, icon_url: d.icon_url,
        install_status: d.install_status, installed_version: d.installed_version,
        local_mod_id: None, hydrated: true, tag_id: d.tag_id, subscribed: d.subscribed,
    }
}

pub async fn browse_repo(
    category: String,
    sort_by: String,
    page: u32,
    per_page: Option<u32>,
    search_query: String,
    force_refresh: bool,
) -> Result<RepoPageResponse, String> {
    catalog_search::bump_hydrate_generation();
    let config = detect_beamng_config()?;
    let bridge_enabled = crate::bridge_client::is_bridge_enabled(&config);
    if bridge_enabled {
        crate::bridge_client::ensure_subscribed_tags_loaded(&config).await;
    }
    let local_mods = crate::local_mods::get_cached_or_list_local_mods(&config).unwrap_or_default();
    let query_trimmed = search_query.trim().to_lowercase();

    if let Some(rid) = ID_RE.captures(&query_trimmed).and_then(|c| c.get(1)).and_then(|m| m.as_str().parse::<u64>().ok()) {
        if bridge_enabled {
            if let Some(d) = crate::bridge_client::try_details_via_bridge(&config, "", rid, &local_mods).await {
                if category != "subscribed" || d.subscribed == Some(true) {
                    web_status::clear_web_error();
                    let mut items = vec![details_to_item(d)];
                    annotate_install_status(&mut items, &local_mods);
                    return Ok(RepoPageResponse { items, current_page: 1, total_pages: 1, repo_source: Some("game_bridge".to_string()) });
                }
            }
        }
    } else {
        let bridge_key = format!("{}:{}:{}:{}", category, sort_by, page, query_trimmed);
        if !force_refresh && bridge_enabled {
            if let Some((cached_items, total_pages, ts)) = BRIDGE_CACHE.lock().ok().and_then(|c| c.get(&bridge_key).cloned()) {
                if ts.elapsed() < Duration::from_secs(300) {
                    web_status::clear_web_error();
                    let mut items = cached_items;
                    annotate_install_status(&mut items, &local_mods);
                    return Ok(RepoPageResponse { items, current_page: page.max(1), total_pages, repo_source: Some("game_bridge".to_string()) });
                }
            }
        }
        if let Some(res) = crate::bridge_client::try_browse_via_bridge(&config, &category, &sort_by, page, search_query.trim(), &local_mods).await {
            web_status::clear_web_error();
            if let Ok(mut cache) = BRIDGE_CACHE.lock() {
                cache.insert(bridge_key, (res.items.clone(), res.total_pages, Instant::now()));
            }
            return Ok(res);
        }
    }

    if category == "subscribed" {
        return Err("BeamNG Game Bridge must be connected and authenticated to view subscribed mods.".to_string());
    }

    if !query_trimmed.is_empty() {
        return catalog_search::search_global_catalog(
            &config, &category, &sort_by, page, per_page.unwrap_or(12), &query_trimmed, force_refresh, &local_mods,
        ).await;
    }

    let cache_key = format!("{}:{}:{}", category, sort_by, page);
    if !force_refresh {
        if let Some((cached_items, total_pages, ts)) = REPO_CACHE.lock().ok().and_then(|c| c.get(&cache_key).cloned()) {
            if ts.elapsed() < Duration::from_secs(300) {
                let mut items = cached_items;
                annotate_install_status(&mut items, &local_mods);
                return Ok(RepoPageResponse { items, current_page: page.max(1), total_pages, repo_source: Some("web_listing".to_string()) });
            }
        }
    }

    let html = fetch_text_with_retry(&build_listing_url(&category, &sort_by, page)).await?;
    let (mut items, total_pages) = parse_resource_list_html(&html);
    if let Ok(mut cache) = REPO_CACHE.lock() { cache.insert(cache_key, (items.clone(), total_pages, Instant::now())); }
    annotate_install_status(&mut items, &local_mods);
    Ok(RepoPageResponse { items, current_page: page.max(1), total_pages, repo_source: Some("web_listing".to_string()) })
}

pub(crate) fn sync_detail_status(details: &mut RepoModDetails, local_mods: &[LocalMod], resolved_id: u64) {
    let effective_rid = if resolved_id > 0 { resolved_id } else { details.resource_id };
    let matched = parser::find_matching_local_mod(
        local_mods, details.tag_id.as_deref(), effective_rid, &details.slug, &details.title,
    );
    if let Some(lm) = matched {
        if details.tag_id.is_none() { details.tag_id = lm.tag_id.clone(); }
        details.installed_version = Some(lm.version.clone());
        let norm_remote = update_checker::normalize_ver(&details.version);
        details.install_status = if lm.location == "staging" { "staged" }
            else if !norm_remote.is_empty() && update_checker::normalize_ver(&lm.version) != norm_remote { "update_available" }
            else if !lm.active { "disabled" }
            else { "installed" }.to_string();
    } else {
        details.installed_version = None;
        details.install_status = "not_installed".to_string();
    }
    details.subscribed = details.tag_id.as_deref().and_then(crate::bridge_client::is_tag_subscribed).or(details.subscribed);
}

pub async fn fetch_repo_mod_details(slug: String, resource_id: u64) -> Result<RepoModDetails, String> {
    let config = detect_beamng_config()?;
    let bridge_enabled = crate::bridge_client::is_bridge_enabled(&config);
    if bridge_enabled { crate::bridge_client::ensure_subscribed_tags_loaded(&config).await; }
    let local_mods = crate::local_mods::get_cached_or_list_local_mods(&config).unwrap_or_default();
    if resource_id > 0 {
        if let Some((cached, ts)) = DETAIL_CACHE.lock().ok().and_then(|c| c.get(&resource_id).cloned()) {
            if ts.elapsed() < Duration::from_secs(600) {
                let mut details = cached;
                sync_detail_status(&mut details, &local_mods, resource_id);
                let can_upgrade = bridge_enabled && (details.gallery_images.is_empty() || details.subscribed.is_none() || details.tag_id.is_none());
                if can_upgrade {
                    if let Some(mut upgraded) = crate::bridge_client::try_details_via_bridge(&config, &slug, resource_id, &local_mods).await {
                        if upgraded.recent_updates.is_empty() { upgraded.recent_updates = details.recent_updates; }
                        if !upgraded.slug.starts_with("bridge/") { cache_detail_entry(resource_id, &upgraded); }
                        return Ok(upgraded);
                    }
                }
                return Ok(details);
            }
        }
    }
    if let Some(details) = crate::bridge_client::try_details_via_bridge(&config, &slug, resource_id, &local_mods).await {
        if !details.slug.starts_with("bridge/") {
            let cache_id = if details.resource_id > 0 { details.resource_id } else { resource_id };
            cache_detail_entry(cache_id, &details);
        }
        return Ok(details);
    }
    let clean_slug = if slug.trim().is_empty() { format!("resources/{}/", resource_id) } else { slug.trim_start_matches('/').to_string() };
    if clean_slug.starts_with("bridge/") { return Err("Bridge mod details require an active BeamNG.drive game bridge session.".to_string()); }
    let resource_url = format!("{}{}", BASE_URL, clean_slug);
    let html = fetch_text_with_retry(&resource_url).await?;
    let (mut details, resolved_id) = parse_mod_details_html(&html, &clean_slug, resource_id);
    let updates_base = resource_url.split('?').next().unwrap_or(&resource_url).trim_end_matches('/');
    if let Ok(updates_html) = fetch_text_with_retry(&format!("{}/updates", updates_base)).await {
        let full_updates = parse_updates_page_html(&updates_html);
        if !full_updates.is_empty() { details.recent_updates = full_updates; }
    }
    sync_detail_status(&mut details, &local_mods, resolved_id);
    cache_detail_entry(if resolved_id > 0 { resolved_id } else { resource_id }, &details);
    Ok(details)
}
