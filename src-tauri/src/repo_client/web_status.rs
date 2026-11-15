use crate::models::RepoWebStatus;
use once_cell::sync::Lazy;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Clone)]
struct WebStatusRecord {
    kind: String,
    status_code: Option<u16>,
    message: Option<String>,
    updated_at: u64,
}

impl WebStatusRecord {
    fn ok(updated_at: u64) -> Self {
        Self { kind: "ok".to_string(), status_code: None, message: None, updated_at }
    }
}

impl Default for WebStatusRecord {
    fn default() -> Self {
        Self::ok(0)
    }
}

static LAST_WEB_STATUS: Lazy<Mutex<WebStatusRecord>> = Lazy::new(|| Mutex::new(WebStatusRecord::default()));

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

pub fn record_web_ok() {
    if let Ok(mut guard) = LAST_WEB_STATUS.lock() {
        *guard = WebStatusRecord::ok(now_secs());
    }
}

/// Resets stale web error state to `"ok"` without dropping active rate-limit cooldowns.
pub fn clear_web_error() {
    if let Ok(mut guard) = LAST_WEB_STATUS.lock() {
        if guard.kind != "ok" || guard.message.is_some() || guard.status_code.is_some() {
            *guard = WebStatusRecord::ok(now_secs());
        }
    }
}

pub(crate) fn reset_web_status() {
    if let Ok(mut guard) = LAST_WEB_STATUS.lock() {
        *guard = WebStatusRecord::default();
    }
}

pub fn record_web_error(kind: &str, status_code: Option<u16>, message: impl Into<String>) {
    if let Ok(mut guard) = LAST_WEB_STATUS.lock() {
        *guard = WebStatusRecord {
            kind: kind.to_string(),
            status_code,
            message: Some(message.into()),
            updated_at: now_secs(),
        };
    }
}

pub fn current_web_status() -> RepoWebStatus {
    let cooldown_remaining_secs = super::cooldown_remaining()
        .map(|d| d.as_secs() + u64::from(d.subsec_nanos() > 0))
        .unwrap_or(0);
    let rate_limited = cooldown_remaining_secs > 0;
    let rec = LAST_WEB_STATUS.lock().map(|g| g.clone()).unwrap_or_default();
    let kind = if rate_limited && rec.kind == "ok" {
        "rate_limit".to_string()
    } else {
        rec.kind
    };
    RepoWebStatus {
        rate_limited,
        cooldown_remaining_secs,
        kind,
        status_code: rec.status_code,
        message: rec.message,
        updated_at: rec.updated_at,
    }
}
