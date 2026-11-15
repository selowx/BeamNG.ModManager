use crate::models::{CachedModMeta, LocalMod};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

fn default_profile_tag() -> String {
    "general".to_string()
}

fn default_pin_policy() -> String {
    "keep_pinned".to_string()
}

fn default_max_concurrent() -> u8 {
    2
}

fn default_post_dl_mode() -> String {
    "enabled".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgressPayload {
    pub task_id: String,
    pub resource_id: u64,
    pub title: String,
    pub filename: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub speed_bps: u64,
    pub status: String,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProfileModRef {
    #[serde(default)]
    pub mod_id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub filename: String,
    #[serde(default)]
    pub author: String,
    #[serde(default)]
    pub resource_id: Option<u64>,
    #[serde(default)]
    pub tag_id: Option<String>,
    #[serde(default)]
    pub slug: Option<String>,
    #[serde(default)]
    pub size_bytes: u64,
}

impl ProfileModRef {
    pub fn from_local_mod(m: &LocalMod) -> Self {
        Self {
            mod_id: m.id.to_lowercase(),
            title: m.title.clone(),
            filename: m.filename.clone(),
            author: m.author.clone(),
            resource_id: m.resource_id,
            tag_id: m.tag_id.clone(),
            slug: m.latest_slug.clone().or_else(|| m.resource_id.map(|r| format!("resources/{}/", r))),
            size_bytes: m.size_bytes,
        }
    }

    pub fn is_downloadable(&self) -> bool {
        self.resource_id.unwrap_or(0) > 0
            || self.slug.as_deref().is_some_and(|s| !s.trim().is_empty())
            || self.tag_id.as_deref().is_some_and(|t| !t.trim().is_empty())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModProfile {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default = "default_profile_tag")]
    pub tag: String,
    #[serde(default)]
    pub mod_ids: Vec<String>,
    #[serde(default)]
    pub mod_refs: HashMap<String, ProfileModRef>,
    #[serde(default = "default_pin_policy")]
    pub pin_policy: String,
    #[serde(default)]
    pub created_at: u64,
    #[serde(default)]
    pub updated_at: u64,
    #[serde(default)]
    pub last_applied_at: Option<u64>,
}

impl Default for ModProfile {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: String::new(),
            description: String::new(),
            tag: default_profile_tag(),
            mod_ids: Vec::new(),
            mod_refs: HashMap::new(),
            pin_policy: default_pin_policy(),
            created_at: 0,
            updated_at: 0,
            last_applied_at: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PreviousProfileBackup {
    pub previous_active_profile_id: Option<String>,
    pub active_mod_ids: Vec<String>,
    pub saved_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfilesState {
    pub profiles: Vec<ModProfile>,
    pub active_profile_id: Option<String>,
    pub has_undo_backup: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileApplyPreview {
    pub profile_id: String,
    pub profile_name: String,
    pub pin_policy: String,
    pub to_enable: Vec<ProfileModRef>,
    pub to_disable: Vec<ProfileModRef>,
    pub kept_pinned: Vec<ProfileModRef>,
    pub missing_downloadable: Vec<ProfileModRef>,
    pub missing_manual: Vec<ProfileModRef>,
    pub already_active_count: usize,
    pub game_running: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyProfileResult {
    pub changed_count: usize,
    pub active_profile_id: Option<String>,
    pub has_undo_backup: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileImportAnalysis {
    pub name: String,
    pub description: String,
    pub tag: String,
    pub pin_policy: String,
    pub mod_ids: Vec<String>,
    pub mod_refs: HashMap<String, ProfileModRef>,
    pub installed_count: usize,
    pub missing_downloadable: Vec<ProfileModRef>,
    pub missing_manual: Vec<ProfileModRef>,
    pub duplicate_name_exists: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnqueueDownloadInput {
    pub resource_id: u64,
    pub slug: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DownloadTaskRecord {
    pub task_id: String,
    pub resource_id: u64,
    #[serde(default)]
    pub slug: String,
    pub title: String,
    #[serde(default)]
    pub filename: String,
    #[serde(default)]
    pub downloaded_bytes: u64,
    #[serde(default)]
    pub total_bytes: u64,
    #[serde(default)]
    pub speed_bps: u64,
    #[serde(default)]
    pub eta_seconds: Option<u64>,
    pub status: String,
    #[serde(default)]
    pub message: Option<String>,
    #[serde(default)]
    pub part_path: Option<String>,
    #[serde(default)]
    pub priority: i64,
    #[serde(default)]
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DownloadHistoryEntry {
    pub task_id: String,
    pub resource_id: u64,
    #[serde(default)]
    pub slug: String,
    pub title: String,
    #[serde(default)]
    pub filename: String,
    #[serde(default)]
    pub size_bytes: u64,
    pub status: String,
    pub completed_at: u64,
    #[serde(default)]
    pub local_mod_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadSettings {
    #[serde(default = "default_max_concurrent")]
    pub max_concurrent: u8,
    #[serde(default)]
    pub speed_limit_bps: u64,
    #[serde(default = "default_post_dl_mode")]
    pub post_download_mode: String,
    #[serde(default)]
    pub add_to_active_profile: bool,
}

impl Default for DownloadSettings {
    fn default() -> Self {
        Self {
            max_concurrent: default_max_concurrent(),
            speed_limit_bps: 0,
            post_download_mode: default_post_dl_mode(),
            add_to_active_profile: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DownloadManagerSnapshot {
    pub tasks: Vec<DownloadTaskRecord>,
    pub history: Vec<DownloadHistoryEntry>,
    pub settings: DownloadSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ManagerStateFile {
    pub pinned_mods: Vec<String>,
    /// Maps mod `id` -> original origin_dir ("repo" or "mods") when moved to `mods_disabled`
    pub disabled_origins: HashMap<String, String>,
    /// Cached metadata for mods moved to `mods_disabled` so we don't have to re-open large zips
    pub cached_metadata: HashMap<String, CachedModMeta>,
    #[serde(default)]
    pub profiles: Vec<ModProfile>,
    #[serde(default)]
    pub active_profile_id: Option<String>,
    #[serde(default)]
    pub previous_profile_backup: Option<PreviousProfileBackup>,
    #[serde(default)]
    pub download_queue: Vec<DownloadTaskRecord>,
    #[serde(default)]
    pub download_history: Vec<DownloadHistoryEntry>,
    #[serde(default)]
    pub download_settings: DownloadSettings,
}
