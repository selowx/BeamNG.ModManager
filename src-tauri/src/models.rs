use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BeamNGConfig {
    pub version: String,
    pub install_path: String,
    pub user_path: String,
    pub mods_path: String,
    pub repo_path: String,
    pub disabled_path: String,
    pub staging_path: String,
    pub db_json_path: String,
    pub game_running: bool,
    pub staged_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalMod {
    pub id: String,
    pub filename: String,
    pub full_path: String,
    pub origin_dir: String,
    pub location: String,
    pub active: bool,
    pub pinned: bool,
    pub title: String,
    pub author: String,
    pub version: String,
    pub tag_id: Option<String>,
    pub resource_id: Option<u64>,
    pub category: String,
    pub size_bytes: u64,
    pub date_added: u64,
    pub last_update: Option<u64>,
    pub icon_url: Option<String>,
    pub has_update: bool,
    pub latest_version: Option<String>,
    pub latest_slug: Option<String>,
    #[serde(default)]
    pub subscribed: Option<bool>,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoModItem {
    pub resource_id: u64,
    pub slug: String,
    pub title: String,
    pub version: String,
    pub author: String,
    pub tagline: String,
    pub category: String,
    pub rating: f32,
    pub rating_count: u32,
    pub downloads: u64,
    pub subscriptions: u64,
    pub updated_text: String,
    pub updated_timestamp: u64,
    pub icon_url: String,
    pub install_status: String,
    pub installed_version: Option<String>,
    pub local_mod_id: Option<String>,
    #[serde(default = "default_true")]
    pub hydrated: bool,
    #[serde(default)]
    pub tag_id: Option<String>,
    #[serde(default)]
    pub subscribed: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogHydrateTarget {
    pub resource_id: u64,
    pub slug: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoPageResponse {
    pub items: Vec<RepoModItem>,
    pub current_page: u32,
    pub total_pages: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repo_source: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeStatus {
    pub installed: bool,
    #[serde(default)]
    pub outdated: bool,
    #[serde(default)]
    pub installed_version: Option<String>,
    pub bundled_version: String,
    #[serde(default)]
    pub running_version: Option<String>,
    pub extension_ready: bool,
    pub enabled: bool,
    pub port: u16,
    pub game_running: bool,
    pub reachable: bool,
    pub online_features: bool,
    pub authenticated: bool,
    pub requests_served: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoWebStatus {
    pub rate_limited: bool,
    pub cooldown_remaining_secs: u64,
    pub kind: String,
    pub status_code: Option<u16>,
    pub message: Option<String>,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeSubResult {
    pub ok: bool,
    pub subscribed: bool,
    pub tag_id: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModUpdateEntry {
    pub id: Option<String>,
    pub title: String,
    pub date_text: String,
    pub body_html: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoModDetails {
    pub resource_id: u64,
    pub slug: String,
    pub title: String,
    pub version: String,
    pub author: String,
    pub tagline: String,
    pub description_text: String,
    pub description_html: String,
    pub recent_updates: Vec<ModUpdateEntry>,
    pub category: String,
    pub rating: f32,
    pub downloads: u64,
    pub file_size_text: String,
    pub tag_id: Option<String>,
    pub download_url: Option<String>,
    pub icon_url: String,
    pub gallery_images: Vec<String>,
    pub install_status: String,
    pub installed_version: Option<String>,
    #[serde(default)]
    pub subscribed: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictGroup {
    pub file_path: String,
    pub severity: String,
    pub mods: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanReport {
    pub total_mods_scanned: usize,
    pub scan_duration_ms: u64,
    pub conflicts: Vec<ConflictGroup>,
    pub corrupt_zips: Vec<String>,
    pub duplicate_mods: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedModMeta {
    pub title: String,
    pub author: String,
    pub version: String,
    pub tag_id: Option<String>,
    pub resource_id: Option<u64>,
    pub category: String,
    pub last_update: Option<u64>,
    pub icon_url: Option<String>,
    #[serde(default)]
    pub size_bytes: Option<u64>,
    #[serde(default)]
    pub modified_ts: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheSummary {
    pub catalog_bytes: u64,
    pub catalog_exists: bool,
    pub local_metadata_entries: usize,
    pub staging_part_files: usize,
    pub staging_part_bytes: u64,
    pub memory_repo_entries: usize,
    pub memory_update_entries: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheClearResult {
    pub scope: String,
    pub freed_bytes: u64,
    pub cleared_entries: usize,
}

pub use crate::models_state::*;
