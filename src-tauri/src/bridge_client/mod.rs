pub mod assets;
pub mod bbcode;
pub mod pacer;
pub mod subscribed;

pub use assets::{
    are_assets_outdated, install_bridge_extension, is_bridge_enabled,
    sync_installed_assets_if_outdated, uninstall_bridge_extension, update_bridge_settings,
};
pub use subscribed::{
    ensure_subscribed_tags_loaded, fetch_all_subscribed_entries, fetch_bridge_mod_version,
    is_tag_subscribed,
};
use assets::{active_settings, is_installed, load_settings};
use crate::models::{BeamNGConfig, BridgeStatus, BridgeSubResult, LocalMod, RepoModDetails, RepoModItem, RepoPageResponse};
use once_cell::sync::Lazy;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;
use subscribed::{clear_subscribed_cache, merge_cached_subscribed_tags, set_cached_tag_subscribed};

static BRIDGE_HTTP: Lazy<reqwest::Client> = Lazy::new(|| {
    reqwest::Client::builder().no_proxy().build().unwrap_or_else(|_| reqwest::Client::new())
});
pub(super) static TAG_ID_CACHE: Lazy<Mutex<HashMap<u64, String>>> = Lazy::new(|| Mutex::new(HashMap::new()));
static BRIDGE_DL_CACHE: Lazy<Mutex<HashMap<String, (String, String)>>> = Lazy::new(|| Mutex::new(HashMap::new()));

async fn bridge_get_raw(port: u16, token: &str, path: &str, query: &[(&str, &str)], timeout_ms: u64) -> Result<Value, String> {
    if matches!(path, "/v1/mods" | "/v1/subscribed" | "/v1/mod" | "/v1/subscribe" | "/v1/unsubscribe") {
        pacer::pace_bridge_call(150).await;
    }
    let url = format!("http://127.0.0.1:{}{}", port, path);
    let resp = BRIDGE_HTTP.get(&url).header("X-Bridge-Token", token)
        .query(query).timeout(Duration::from_millis(timeout_ms)).send().await
        .map_err(|e| format!("Failed to reach BeamNG Game Bridge: {}", e))?;
    resp.json::<Value>().await.map_err(|e| format!("Invalid BeamNG Game Bridge response: {}", e))
}

pub(super) async fn bridge_get(port: u16, token: &str, path: &str, query: &[(&str, &str)], timeout_ms: u64) -> Option<Value> {
    let val = bridge_get_raw(port, token, path, query, timeout_ms).await.ok()?;
    (val.get("ok").and_then(|v| v.as_bool()) == Some(true)).then_some(val)
}

pub async fn get_bridge_status(config: &BeamNGConfig) -> BridgeStatus {
    let (installed, outdated, settings) = (is_installed(config), are_assets_outdated(config), load_settings(config));
    let mut status = BridgeStatus {
        installed, outdated,
        installed_version: assets::read_installed_version(config),
        bundled_version: assets::BRIDGE_ASSET_VERSION.to_string(),
        running_version: None,
        extension_ready: false, enabled: settings.enabled, port: settings.port,
        game_running: config.game_running, reachable: false, online_features: false,
        authenticated: false, requests_served: 0,
    };
    let Some(s) = active_settings(config) else { clear_subscribed_cache(); return status; };
    let Some(v) = bridge_get(s.port, &s.token, "/v1/health", &[], 400).await else { clear_subscribed_cache(); return status; };
    status.reachable = true;
    status.running_version = v.get("version").and_then(|x| x.as_str()).map(|s| s.to_string());
    status.online_features = v.get("onlineFeatures").and_then(|x| x.as_bool()).unwrap_or(false);
    status.authenticated = v.get("authenticated").and_then(|x| x.as_bool()).unwrap_or(false);
    status.extension_ready = v.get("modManagerReady").and_then(|x| x.as_bool()).unwrap_or(true);
    status.requests_served = v.get("requestsServed").and_then(|x| x.as_u64()).unwrap_or(0);
    if let Some(p) = v.get("port").and_then(|x| x.as_u64()).and_then(|p| u16::try_from(p).ok()).filter(|&p| p >= 1024) {
        status.port = p;
    }
    if let Some(en) = v.get("enabled").and_then(|x| x.as_bool()) { status.enabled = en; }
    status
}

pub(super) fn json_str(v: &Value, key: &str) -> String { v.get(key).and_then(|x| x.as_str()).map(|s| s.trim().to_string()).unwrap_or_default() }
pub(super) fn json_u64(v: &Value, key: &str) -> u64 { v.get(key).and_then(|x| x.as_u64().or_else(|| x.as_str().and_then(|s| s.trim().parse().ok()))).unwrap_or(0) }
fn json_f32(v: &Value, key: &str) -> f32 { v.get(key).and_then(|x| x.as_f64().map(|n| n as f32).or_else(|| x.as_str().and_then(|s| s.trim().parse().ok()))).unwrap_or(0.0) }
fn json_bool_opt(v: &Value) -> Option<bool> { v.get("sub").or_else(|| v.get("subscribed")).and_then(|x| x.as_bool().or_else(|| x.as_u64().map(|n| n != 0))) }
fn normalize_mod_path(path: &str, tagid: &str, ver: &str) -> String {
    let p = path.trim().trim_start_matches('/');
    if !p.is_empty() { if p.ends_with('/') { p.to_string() } else { format!("{}/", p) } }
    else if !tagid.trim().is_empty() && !ver.trim().is_empty() { format!("{}/{}/", tagid.trim(), ver.trim()) }
    else { String::new() }
}
fn bridge_icon_url(path: &str) -> String { if path.is_empty() { String::new() } else { format!("https://api.beamng.com/s1/v4/download/mods/{}icon.jpg", path) } }
fn fallback_id(tagid: &str) -> u64 {
    10_000_000 + (tagid.as_bytes().iter().fold(0xcbf29ce484222325u64, |a, &b| (a ^ b as u64).wrapping_mul(0x100000001b3)) % 89_000_000)
}
fn format_unix_date(ts: u64) -> String {
    if ts == 0 { return "Recent".to_string(); }
    let z = (ts / 86400) as i64 + 719468;
    let (era, doe) = (z.div_euclid(146097), z.rem_euclid(146097) as u64);
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    format!("{:04}-{:02}-{:02}", yoe as i64 + era * 400 + if m <= 2 { 1 } else { 0 }, m, doy - (153 * mp + 2) / 5 + 1)
}
fn map_category(cat: &str) -> &'static str {
    match cat { "vehicles.2" => "3,4,5,6,14", "terrains-levels-maps.9" => "9", "scenarios.8" => "8", "user-interface-apps.10" => "10", "sounds.13" => "13", "mods-of-mods.7" => "7", "skins.12" => "12", "automation.16" => "16", _ => "" }
}
pub(super) fn bridge_slug(rid: u64, tagid: &str) -> String { if rid > 0 { format!("resources/{}/", rid) } else { format!("bridge/{}", tagid) } }
fn safe_zip_filename(raw: &str) -> Option<String> {
    let base = raw.trim().rsplit(['/', '\\']).next()?.trim();
    if base.is_empty() || base == "." || base == ".." || base.contains("..") { return None; }
    let clean: String = base.chars().map(|c| if "<>:\"/\\|?*".contains(c) { '_' } else { c }).collect();
    clean.to_lowercase().ends_with(".zip").then_some(clean)
}
fn cache_bridge_dl(tagid: &str, obj: &Value, ver: &str) -> Option<(String, String)> {
    let tid = tagid.trim();
    let fname = safe_zip_filename(&json_str(obj, "filename"))?;
    let sub = json_str(obj, "path").trim().trim_matches('/').to_string();
    let sub = if !sub.is_empty() { sub } else if !tid.is_empty() && !ver.trim().is_empty() { format!("{}/{}", tid, ver.trim()) } else { return None; };
    if sub.contains("..") { return None; }
    let info = (format!("https://api.beamng.com/s1/v4/download/mods/{}/{}", sub, fname), fname);
    if !tid.is_empty() { if let Ok(mut c) = BRIDGE_DL_CACHE.lock() { c.insert(tid.to_string(), info.clone()); } }
    Some(info)
}

fn resolve_tag_id(slug: &str, resource_id: u64, local_mods: &[LocalMod]) -> Option<String> {
    slug.trim_matches('/').strip_prefix("bridge/").map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
        .or_else(|| (resource_id > 0).then(|| TAG_ID_CACHE.lock().ok().and_then(|c| c.get(&resource_id).cloned())).flatten())
        .or_else(|| (resource_id > 0).then(|| local_mods.iter().find(|m| m.resource_id == Some(resource_id)).and_then(|m| m.tag_id.clone())).flatten())
}

async fn resolve_bridge_download_by_tag(config: &BeamNGConfig, tagid: &str) -> Option<(String, String)> {
    let tid = tagid.trim();
    if tid.is_empty() { return None; }
    if let Some(hit) = BRIDGE_DL_CACHE.lock().ok().and_then(|c| c.get(tid).cloned()) { return Some(hit); }
    let s = active_settings(config)?;
    let val = bridge_get(s.port, &s.token, "/v1/mod", &[("id", tid)], 8000).await?;
    let d = val.get("data").and_then(|v| v.get("data").filter(|inner| inner.is_object()).or(Some(v)))?;
    d.is_object().then(|| cache_bridge_dl(tid, d, &json_str(d, "version_string"))).flatten()
}

pub async fn resolve_bridge_download(config: &BeamNGConfig, slug: &str) -> Option<(String, String)> {
    let tagid = slug.trim_matches('/').strip_prefix("bridge/")?.trim();
    resolve_bridge_download_by_tag(config, tagid).await
}

/// Resolves direct `api.beamng.com` CDN download `(url, filename)` for a resource ID or bridge slug.
pub async fn resolve_bridge_download_by_id(
    config: &BeamNGConfig, resource_id: u64, slug: &str, local_mods: &[LocalMod],
) -> Option<(String, String)> {
    let tagid = resolve_tag_id(slug, resource_id, local_mods)?;
    resolve_bridge_download_by_tag(config, &tagid).await
}

pub async fn try_browse_via_bridge(
    config: &BeamNGConfig, category: &str, sort_by: &str, page: u32, search_query: &str, local_mods: &[LocalMod],
) -> Option<RepoPageResponse> {
    if category != "subscribed" { ensure_subscribed_tags_loaded(config).await; }
    let s = active_settings(config)?;
    let order_by = match sort_by { "download_count" => "downloads", "rating_weighted" => "rating", _ => "update" };
    let page_str = page.max(1).to_string();
    let endpoint = if category == "subscribed" { "/v1/subscribed" } else { "/v1/mods" };
    let val = bridge_get(s.port, &s.token, endpoint, &[
        ("query", search_query.trim()), ("order_by", order_by), ("order", "desc"),
        ("page", page_str.as_str()), ("categories", map_category(category)),
    ], 8000).await?;
    let data = val.get("data")?;
    let arr = data.get("data").and_then(|v| v.as_array())?;
    let total_pages = (((json_u64(data, "count").max(arr.len() as u64)).saturating_add(11)) / 12).max(1) as u32;
    if category == "subscribed" && search_query.trim().is_empty() {
        merge_cached_subscribed_tags(arr.iter().map(|e| json_str(e, "tagid")));
    }
    let mut items = Vec::with_capacity(arr.len());
    for entry in arr {
        let tagid = json_str(entry, "tagid");
        let raw_rid = json_u64(entry, "resource_id");
        let rid = if raw_rid > 0 { raw_rid } else if !tagid.is_empty() { fallback_id(&tagid) } else { continue };
        if !tagid.is_empty() { if let Ok(mut cache) = TAG_ID_CACHE.lock() { cache.insert(rid, tagid.clone()); } }
        let (updated_ts, author, ver, cat) = (json_u64(entry, "last_update"), json_str(entry, "username"), json_str(entry, "version_string"), json_str(entry, "category_title"));
        cache_bridge_dl(&tagid, entry, &ver);
        items.push(RepoModItem {
            resource_id: rid, slug: bridge_slug(raw_rid, &tagid),
            title: json_str(entry, "title"), version: if ver.is_empty() { "1.0".into() } else { ver },
            author: if author.is_empty() { "BeamNG Creator".into() } else { author }, tagline: json_str(entry, "tag_line"),
            category: if cat.is_empty() { "Mod".into() } else { cat }, rating: json_f32(entry, "rating_avg"), rating_count: 0,
            downloads: json_u64(entry, "download_count"), subscriptions: 0, updated_text: format_unix_date(updated_ts),
            updated_timestamp: updated_ts, icon_url: bridge_icon_url(&json_str(entry, "path")),
            install_status: "not_installed".into(), installed_version: None, local_mod_id: None, hydrated: true,
            tag_id: (!tagid.is_empty()).then_some(tagid.clone()),
            subscribed: json_bool_opt(entry).or_else(|| (category == "subscribed").then_some(true)).or_else(|| is_tag_subscribed(&tagid)),
        });
    }
    crate::repo_client::parser::annotate_install_status(&mut items, local_mods);
    Some(RepoPageResponse { items, current_page: page.max(1), total_pages, repo_source: Some("game_bridge".into()) })
}

fn extract_attachments(d: &Value, base_path: &str) -> (HashMap<String, String>, Vec<String>) {
    let (mut map, mut gallery) = (HashMap::new(), Vec::new());
    if base_path.is_empty() || base_path.contains("..") { return (map, gallery); }
    let parsed_arr;
    let arr = match d.get("attachments") {
        Some(Value::Array(a)) => a,
        Some(Value::String(s)) => match serde_json::from_str::<Vec<Value>>(s) {
            Ok(v) => { parsed_arr = v; &parsed_arr }
            Err(_) => return (map, gallery),
        },
        _ => return (map, gallery),
    };
    for att in arr {
        let (data_fn, thumb_fn) = (json_str(att, "data_filename"), json_str(att, "thumb_filename"));
        let (folder, fname) = if !data_fn.is_empty() { ("images", data_fn) } else if !thumb_fn.is_empty() { ("thumbs", thumb_fn) } else { continue };
        let clean = fname.trim().rsplit(['/', '\\']).next().unwrap_or("");
        if clean.is_empty() || clean.contains("..") { continue; }
        let url = format!("https://api.beamng.com/s1/v4/download/mods/{}{}/{}", base_path, folder, clean);
        if let Some(stem) = clean.split('.').next().filter(|s| !s.is_empty() && s.chars().all(|c| c.is_ascii_digit())) {
            map.entry(stem.to_string()).or_insert_with(|| url.clone());
        }
        let att_id = json_u64(att, "attachment_id");
        if att_id > 0 { map.entry(att_id.to_string()).or_insert_with(|| url.clone()); }
        if !gallery.iter().any(|x| x == &url) { gallery.push(url); }
    }
    (map, gallery)
}

fn format_bytes(bytes: u64) -> String {
    if bytes >= 1_048_576 { format!("{:.1} MB", bytes as f64 / 1_048_576.0) }
    else if bytes >= 1024 { format!("{:.0} KB", bytes as f64 / 1024.0) }
    else if bytes > 0 { format!("{} B", bytes) } else { "ZIP Archive".into() }
}

pub async fn try_details_via_bridge(
    config: &BeamNGConfig, slug: &str, resource_id: u64, local_mods: &[LocalMod],
) -> Option<RepoModDetails> {
    ensure_subscribed_tags_loaded(config).await;
    let s = active_settings(config)?;
    let tagid = resolve_tag_id(slug, resource_id, local_mods)?;
    let val = bridge_get(s.port, &s.token, "/v1/mod", &[("id", tagid.as_str())], 8000).await?;
    let d = val.get("data").and_then(|v| v.get("data").filter(|inner| inner.is_object()).or(Some(v)))?;
    if !d.is_object() { return None; }
    let raw_rid = json_u64(d, "resource_id");
    let rid = if raw_rid > 0 { raw_rid } else { resource_id };
    let (ver, author, cat, raw_path) = (json_str(d, "version_string"), json_str(d, "username"), json_str(d, "category_title"), json_str(d, "path"));
    let base_path = normalize_mod_path(&raw_path, &tagid, &ver);
    let (att_map, mut gallery_images) = extract_attachments(d, &base_path);
    let (description_text, description_html, inline_images) = bbcode::parse_bbcode_to_html(&json_str(d, "message"), &att_map);
    for img in inline_images {
        if gallery_images.len() >= 8 { break; }
        if !gallery_images.iter().any(|x| x == &img) { gallery_images.push(img); }
    }
    gallery_images.truncate(8);
    let cdn_dl = cache_bridge_dl(&tagid, d, &ver);
    let subscribed = json_bool_opt(d).or_else(|| is_tag_subscribed(&tagid));
    let mut details = RepoModDetails {
        resource_id: rid,
        slug: if !slug.trim().is_empty() && !slug.starts_with("bridge/") { slug.into() } else { bridge_slug(raw_rid, &tagid) },
        title: json_str(d, "title"), version: if ver.is_empty() { "1.0".into() } else { ver },
        author: if author.is_empty() { "BeamNG Creator".into() } else { author }, tagline: json_str(d, "tag_line"),
        description_text, description_html, recent_updates: Vec::new(),
        category: if cat.is_empty() { "Official Repo".into() } else { cat },
        rating: json_f32(d, "rating_avg"), downloads: json_u64(d, "download_count"),
        file_size_text: format_bytes(json_u64(d, "filesize")), tag_id: Some(tagid),
        download_url: if raw_rid > 0 { Some(format!("https://www.beamng.com/resources/{}/", raw_rid)) } else { cdn_dl.map(|(u, _)| u) },
        icon_url: bridge_icon_url(&raw_path),
        gallery_images, install_status: "not_installed".into(), installed_version: None, subscribed,
    };
    crate::repo_client::sync_detail_status(&mut details, local_mods, raw_rid);
    Some(details)
}

async fn set_subscription_via_bridge(config: &BeamNGConfig, tag_id: &str, subscribe: bool) -> Result<BridgeSubResult, String> {
    let tid = tag_id.trim();
    if tid.is_empty() || !tid.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') {
        return Err("Invalid mod tagId.".to_string());
    }
    let s = active_settings(config).ok_or_else(|| "BeamNG Game Bridge must be installed, enabled, and running.".to_string())?;
    let endpoint = if subscribe { "/v1/subscribe" } else { "/v1/unsubscribe" };
    let val = bridge_get_raw(s.port, &s.token, endpoint, &[("id", tid)], 8000).await?;
    if val.get("ok").and_then(|v| v.as_bool()) != Some(true) {
        let msg = val.get("error").and_then(|v| v.as_str())
            .or_else(|| val.get("data").and_then(|d| d.get("message")).and_then(|v| v.as_str()))
            .filter(|m| !m.trim().is_empty()).unwrap_or("Game Bridge subscription request failed.");
        return Err(msg.to_string());
    }
    set_cached_tag_subscribed(tid, subscribe);
    crate::repo_client::clear_bridge_caches();
    Ok(BridgeSubResult {
        ok: true, subscribed: subscribe, tag_id: tid.to_string(),
        message: if subscribe { "Subscribed to mod.".to_string() } else { "Unsubscribed from mod.".to_string() },
    })
}

pub async fn subscribe_via_bridge(config: &BeamNGConfig, tag_id: &str) -> Result<BridgeSubResult, String> { set_subscription_via_bridge(config, tag_id, true).await }
pub async fn unsubscribe_via_bridge(config: &BeamNGConfig, tag_id: &str) -> Result<BridgeSubResult, String> { set_subscription_via_bridge(config, tag_id, false).await }

pub(crate) fn memory_cache_count() -> usize {
    TAG_ID_CACHE.lock().map(|c| c.len()).unwrap_or(0) + BRIDGE_DL_CACHE.lock().map(|c| c.len()).unwrap_or(0) + subscribed::subscribed_cache_count()
}

pub(crate) fn clear_memory_caches() -> usize {
    let mut cleared = subscribed::clear_subscribed_cache_counted();
    if let Ok(mut c) = TAG_ID_CACHE.lock() { cleared += c.len(); c.clear(); }
    if let Ok(mut c) = BRIDGE_DL_CACHE.lock() { cleared += c.len(); c.clear(); }
    cleared
}
