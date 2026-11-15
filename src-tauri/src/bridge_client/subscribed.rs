use super::assets::active_settings;
use super::{bridge_get, bridge_slug, json_str, json_u64, TAG_ID_CACHE};
use crate::models::BeamNGConfig;
use once_cell::sync::Lazy;
use std::collections::HashSet;
use std::sync::Mutex;
use std::time::{Duration, Instant};

type SubscribedEntry = (Option<u64>, String, String, String);

static SUBSCRIBED_TAG_CACHE: Lazy<Mutex<Option<HashSet<String>>>> = Lazy::new(|| Mutex::new(None));
static SUBSCRIBED_ENTRIES_CACHE: Lazy<Mutex<Option<(Vec<SubscribedEntry>, Instant)>>> =
    Lazy::new(|| Mutex::new(None));

/// Clears the cached set of subscribed uppercase tag IDs and 60s subscribed entries snapshot.
pub(super) fn clear_subscribed_cache() {
    if let Ok(mut c) = SUBSCRIBED_TAG_CACHE.lock() {
        *c = None;
    }
    if let Ok(mut c) = SUBSCRIBED_ENTRIES_CACHE.lock() {
        *c = None;
    }
}

pub(super) fn subscribed_cache_count() -> usize {
    let tags = SUBSCRIBED_TAG_CACHE.lock().ok().and_then(|g| g.as_ref().map(|s| s.len())).unwrap_or(0);
    let entries = SUBSCRIBED_ENTRIES_CACHE.lock().ok().and_then(|g| g.as_ref().map(|(v, _)| v.len())).unwrap_or(0);
    tags + entries
}

pub(super) fn clear_subscribed_cache_counted() -> usize {
    let mut cleared = 0;
    if let Ok(mut c) = SUBSCRIBED_TAG_CACHE.lock() {
        if let Some(s) = c.take() { cleared += s.len(); }
    }
    if let Ok(mut c) = SUBSCRIBED_ENTRIES_CACHE.lock() {
        if let Some((v, _)) = c.take() { cleared += v.len(); }
    }
    cleared
}

/// Updates a single tag ID in the subscribed cache and invalidates the entries snapshot.
pub(super) fn set_cached_tag_subscribed(tag_id: &str, subscribed: bool) {
    if let Ok(mut c) = SUBSCRIBED_ENTRIES_CACHE.lock() {
        *c = None;
    }
    let key = tag_id.trim().to_ascii_uppercase();
    if key.is_empty() {
        return;
    }
    if let Ok(mut c) = SUBSCRIBED_TAG_CACHE.lock() {
        if let Some(set) = c.as_mut() {
            if subscribed {
                set.insert(key);
            } else {
                set.remove(&key);
            }
        }
    }
}

/// Inserts a batch of tag IDs into the subscribed cache when already populated.
pub(super) fn merge_cached_subscribed_tags<I: IntoIterator<Item = String>>(tags: I) {
    if let Ok(mut c) = SUBSCRIBED_TAG_CACHE.lock() {
        if let Some(set) = c.as_mut() {
            for tag in tags {
                let key = tag.trim().to_ascii_uppercase();
                if !key.is_empty() {
                    set.insert(key);
                }
            }
        }
    }
}

/// Returns whether `tag_id` is present in the loaded subscribed tag cache.
pub fn is_tag_subscribed(tag_id: &str) -> Option<bool> {
    let key = tag_id.trim().to_ascii_uppercase();
    if key.is_empty() {
        return None;
    }
    SUBSCRIBED_TAG_CACHE
        .lock()
        .ok()?
        .as_ref()
        .map(|set| set.contains(&key))
}

fn store_subscribed_cache(set: HashSet<String>) {
    let was_none = {
        let Ok(mut c) = SUBSCRIBED_TAG_CACHE.lock() else {
            return;
        };
        let prev_none = c.is_none();
        *c = Some(set);
        prev_none
    };
    if was_none {
        crate::local_mods::invalidate_local_mods_cache();
    }
}

/// Fetches all pages of `/v1/subscribed` (60s TTL cache) and returns `(resource_id, tagid, version_string, slug)`.
pub async fn fetch_all_subscribed_entries(
    config: &BeamNGConfig,
) -> Option<Vec<SubscribedEntry>> {
    let s = active_settings(config)?;
    if let Some(cached) = SUBSCRIBED_ENTRIES_CACHE
        .lock()
        .ok()
        .and_then(|g| g.as_ref().and_then(|(v, ts)| (ts.elapsed() < Duration::from_secs(60)).then(|| v.clone())))
    {
        return Some(cached);
    }
    let h = bridge_get(s.port, &s.token, "/v1/health", &[], 400).await?;
    let online = h
        .get("onlineFeatures")
        .and_then(|x| x.as_bool())
        .unwrap_or(false);
    let authed = h
        .get("authenticated")
        .and_then(|x| x.as_bool())
        .unwrap_or(false);
    if !online || !authed {
        return None;
    }

    let mut entries = Vec::new();
    let mut tag_set = HashSet::new();
    let mut collected: u64 = 0;

    for page in 1..=30u32 {
        if page > 1 {
            tokio::time::sleep(Duration::from_millis(160)).await;
        }
        let page_str = page.to_string();
        let val = bridge_get(
            s.port,
            &s.token,
            "/v1/subscribed",
            &[
                ("query", ""),
                ("order_by", "update"),
                ("order", "desc"),
                ("page", page_str.as_str()),
                ("categories", ""),
            ],
            8000,
        )
        .await;

        let Some(val) = val else {
            if page == 1 {
                return None;
            }
            break;
        };

        let Some(data) = val.get("data") else {
            if page == 1 {
                return None;
            }
            break;
        };
        let Some(arr) = data.get("data").and_then(|v| v.as_array()) else {
            if page == 1 {
                return None;
            }
            break;
        };

        if arr.is_empty() {
            break;
        }

        let count = json_u64(data, "count");
        for entry in arr {
            let tagid = json_str(entry, "tagid");
            if tagid.is_empty() {
                continue;
            }
            let raw_rid = json_u64(entry, "resource_id");
            let ver = json_str(entry, "version_string");
            let slug = bridge_slug(raw_rid, &tagid);
            tag_set.insert(tagid.to_ascii_uppercase());
            if raw_rid > 0 {
                if let Ok(mut cache) = TAG_ID_CACHE.lock() {
                    cache.insert(raw_rid, tagid.clone());
                }
                if !ver.is_empty() {
                    crate::repo_client::update_checker::record_remote_version(raw_rid, &ver, &slug);
                }
            }
            if !ver.is_empty() {
                crate::repo_client::update_checker::record_remote_tag_version(&tagid, &ver, &slug);
            }
            entries.push((if raw_rid > 0 { Some(raw_rid) } else { None }, tagid, ver, slug));
        }

        collected = collected.saturating_add(arr.len() as u64);
        if count > 0 && collected >= count {
            break;
        }
    }

    store_subscribed_cache(tag_set);
    if let Ok(mut c) = SUBSCRIBED_ENTRIES_CACHE.lock() {
        *c = Some((entries.clone(), Instant::now()));
    }
    Some(entries)
}

/// Ensures all subscribed mod tag IDs are paginated and loaded into `SUBSCRIBED_TAG_CACHE`.
pub async fn ensure_subscribed_tags_loaded(config: &BeamNGConfig) {
    if SUBSCRIBED_TAG_CACHE
        .lock()
        .ok()
        .and_then(|c| c.as_ref().map(|_| ()))
        .is_some()
    {
        return;
    }
    let _ = fetch_all_subscribed_entries(config).await;
}

/// Queries `/v1/mod` via localhost Game Bridge for `(resource_id, version_string, slug)`.
pub async fn fetch_bridge_mod_version(
    config: &BeamNGConfig,
    tag_id: &str,
) -> Option<(u64, String, String)> {
    let tid = tag_id.trim();
    if tid.is_empty() {
        return None;
    }
    let s = active_settings(config)?;
    let val = bridge_get(s.port, &s.token, "/v1/mod", &[("id", tid)], 8000).await?;
    let d = val
        .get("data")
        .and_then(|v| v.get("data").filter(|inner| inner.is_object()).or(Some(v)))?;
    if !d.is_object() {
        return None;
    }
    let raw_rid = json_u64(d, "resource_id");
    let ver = json_str(d, "version_string");
    if ver.is_empty() {
        return None;
    }
    let slug = bridge_slug(raw_rid, tid);
    if raw_rid > 0 {
        if let Ok(mut cache) = TAG_ID_CACHE.lock() {
            cache.insert(raw_rid, tid.to_string());
        }
    }
    Some((raw_rid, ver, slug))
}
