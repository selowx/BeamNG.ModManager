use crate::models::{BeamNGConfig, BridgeStatus};
use serde::{Deserialize, Serialize};
use std::collections::hash_map::RandomState;
use std::fs;
use std::hash::{BuildHasher, Hasher};
use std::path::{Path, PathBuf};

pub const BRIDGE_ASSET_VERSION: &str = "2.3.3";
const MOD_SCRIPT_LUA: &str = include_str!("../../assets/bridge/modScript.lua");
const BRIDGE_LUA: &str = include_str!("../../assets/bridge/modmanagerBridge.lua");
const UI_INDEX_JS: &str = include_str!("../../assets/bridge/ui_index.js");
const UI_VUE: &str = include_str!("../../assets/bridge/BridgeSettings.vue");
const INFO_JSON: &str = include_str!("../../assets/bridge/info.json");
const ICON_JPG: &[u8] = include_bytes!("../../assets/bridge/icon.jpg");
pub(super) const DEFAULT_PORT: u16 = 23519;

const BRIDGE_ASSETS: [(&str, &[u8]); 6] = [
    ("scripts/modmanager_bridge/modScript.lua", MOD_SCRIPT_LUA.as_bytes()),
    ("lua/ge/extensions/util/modmanagerBridge.lua", BRIDGE_LUA.as_bytes()),
    ("ui/ui-vue/mods/modmanager_bridge/index.js", UI_INDEX_JS.as_bytes()),
    ("ui/ui-vue/mods/modmanager_bridge/BridgeSettings.vue", UI_VUE.as_bytes()),
    ("scripts/modmanager_bridge/info.json", INFO_JSON.as_bytes()),
    ("scripts/modmanager_bridge/icon.jpg", ICON_JPG),
];

fn default_true() -> bool { true }
fn default_port() -> u16 { DEFAULT_PORT }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(super) struct BridgeSettings {
    #[serde(default = "default_true")]
    pub(super) enabled: bool,
    #[serde(default = "default_port")]
    pub(super) port: u16,
    #[serde(default)]
    pub(super) token: String,
}

impl Default for BridgeSettings {
    fn default() -> Self {
        Self { enabled: true, port: DEFAULT_PORT, token: String::new() }
    }
}

fn settings_path(config: &BeamNGConfig) -> PathBuf {
    Path::new(&config.user_path).join("settings").join("modmanager_bridge.json")
}

fn bridge_dir(config: &BeamNGConfig) -> PathBuf {
    Path::new(&config.mods_path).join("unpacked").join("modmanager_bridge")
}

pub(super) fn is_installed(config: &BeamNGConfig) -> bool {
    let dir = bridge_dir(config);
    dir.join("scripts/modmanager_bridge/modScript.lua").exists()
        && dir.join("lua/ge/extensions/util/modmanagerBridge.lua").exists()
        && dir.join("ui/ui-vue/mods/modmanager_bridge/index.js").exists()
}

pub(super) fn load_settings(config: &BeamNGConfig) -> BridgeSettings {
    let mut cfg = fs::read_to_string(settings_path(config)).ok()
        .and_then(|s| serde_json::from_str::<BridgeSettings>(&s).ok())
        .unwrap_or_default();
    if cfg.port < 1024 { cfg.port = DEFAULT_PORT; }
    cfg
}

fn save_settings(config: &BeamNGConfig, settings: &BridgeSettings) -> Result<(), String> {
    let path = settings_path(config);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create bridge settings dir: {}", e))?;
    }
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| format!("Failed to write bridge settings: {}", e))
}

fn generate_token() -> String {
    let (s1, s2) = (RandomState::new().build_hasher().finish(), RandomState::new().build_hasher().finish());
    format!("{:016x}{:08x}", s1, (s2 & 0xffff_ffff) as u32)
}

pub fn is_bridge_enabled(config: &BeamNGConfig) -> bool {
    config.game_running && is_installed(config) && load_settings(config).enabled
}

pub(super) fn active_settings(config: &BeamNGConfig) -> Option<BridgeSettings> {
    if !config.game_running || !is_installed(config) { return None; }
    let s = load_settings(config);
    (s.enabled && s.port >= 1024).then_some(s)
}

fn write_asset(root: &Path, rel: &str, content: &[u8]) -> Result<(), String> {
    let target = root.join(rel);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create dir for {}: {}", rel, e))?;
    }
    fs::write(&target, content).map_err(|e| format!("Failed to write {}: {}", rel, e))
}

fn remove_legacy_mod_info(root: &Path) -> bool {
    let mut removed = false;
    let mod_info_dir = root.join("mod_info");
    for sub in ["modmanager_bridge", "MMBRIDGE01"] {
        let legacy = mod_info_dir.join(sub);
        if legacy.exists() && fs::remove_dir_all(&legacy).is_ok() {
            removed = true;
        }
    }
    if mod_info_dir.exists()
        && fs::read_dir(&mod_info_dir).ok().is_some_and(|mut d| d.next().is_none())
    {
        let _ = fs::remove_dir(&mod_info_dir);
    }
    removed
}

pub fn read_installed_version(config: &BeamNGConfig) -> Option<String> {
    if !is_installed(config) {
        return None;
    }
    let root = bridge_dir(config);
    for rel in [
        "scripts/modmanager_bridge/info.json",
        "mod_info/MMBRIDGE01/info.json",
        "mod_info/modmanager_bridge/info.json",
    ] {
        if let Some(ver) = fs::read_to_string(root.join(rel))
            .ok()
            .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
            .and_then(|v| v.get("version_string").and_then(|x| x.as_str()).map(|s| s.trim().to_string()))
            .filter(|s| !s.is_empty())
        {
            return Some(ver);
        }
    }
    None
}

pub fn are_assets_outdated(config: &BeamNGConfig) -> bool {
    if !is_installed(config) { return false; }
    let root = bridge_dir(config);
    BRIDGE_ASSETS.iter().any(|(rel, expected)| {
        fs::read(root.join(rel)).ok().as_deref() != Some(*expected)
    })
}

pub fn sync_installed_assets_if_outdated(config: &BeamNGConfig) -> bool {
    if !is_installed(config) { return false; }
    let root = bridge_dir(config);
    let mut updated = remove_legacy_mod_info(&root);
    for (rel, expected) in BRIDGE_ASSETS {
        if fs::read(root.join(rel)).ok().as_deref() != Some(expected) {
            if write_asset(&root, rel, expected).is_ok() {
                updated = true;
            }
        }
    }
    updated
}

pub async fn trigger_reload_and_poll(config: &BeamNGConfig) {
    if !config.game_running || !is_installed(config) {
        return;
    }
    let Some(s) = active_settings(config) else { return; };
    let Some(res) = super::bridge_get(s.port, &s.token, "/v1/reload", &[], 800).await else {
        return;
    };
    if res.get("ok").and_then(|v| v.as_bool()) != Some(true) {
        return;
    }
    tokio::time::sleep(std::time::Duration::from_millis(250)).await;
    for attempt in 0..8 {
        if attempt > 0 {
            tokio::time::sleep(std::time::Duration::from_millis(220)).await;
        }
        if let Some(v) = super::bridge_get(s.port, &s.token, "/v1/health", &[], 400).await {
            if v.get("version").and_then(|x| x.as_str()) == Some(BRIDGE_ASSET_VERSION) {
                break;
            }
        }
    }
}

pub async fn reload_bridge_extension(config: &BeamNGConfig) -> Result<BridgeStatus, String> {
    sync_installed_assets_if_outdated(config);
    trigger_reload_and_poll(config).await;
    Ok(super::get_bridge_status(config).await)
}

pub async fn install_bridge_extension(config: &BeamNGConfig) -> Result<BridgeStatus, String> {
    let s_path = settings_path(config);
    let mut settings = load_settings(config);
    if !s_path.exists() || settings.token.trim().is_empty() {
        if settings.token.trim().is_empty() { settings.token = generate_token(); }
        save_settings(config, &settings)?;
    }
    let root = bridge_dir(config);
    let _ = remove_legacy_mod_info(&root);
    for (rel, data) in BRIDGE_ASSETS {
        write_asset(&root, rel, data)?;
    }
    if config.game_running {
        trigger_reload_and_poll(config).await;
    }
    Ok(super::get_bridge_status(config).await)
}

pub async fn uninstall_bridge_extension(config: &BeamNGConfig) -> Result<BridgeStatus, String> {
    let root = bridge_dir(config);
    let _ = remove_legacy_mod_info(&root);
    let is_safe = root.file_name().and_then(|n| n.to_str()) == Some("modmanager_bridge")
        && root.parent().and_then(|p| p.file_name()).and_then(|n| n.to_str()) == Some("unpacked");
    if is_safe && root.exists() {
        fs::remove_dir_all(&root).map_err(|e| format!("Failed to remove bridge extension: {}", e))?;
    }
    Ok(super::get_bridge_status(config).await)
}

pub async fn update_bridge_settings(config: &BeamNGConfig, enabled: bool, port: u16) -> Result<BridgeStatus, String> {
    if port < 1024 { return Err("Bridge port must be between 1024 and 65535.".to_string()); }
    sync_installed_assets_if_outdated(config);
    let mut settings = load_settings(config);
    let old_port = settings.port;
    if settings.token.trim().is_empty() { settings.token = generate_token(); }
    (settings.enabled, settings.port) = (enabled, port);
    save_settings(config, &settings)?;
    if config.game_running && is_installed(config) {
        let (en, port_str) = (if enabled { "1" } else { "0" }, port.to_string());
        let mut state_ok = false;
        for p in if old_port != port { vec![old_port, port] } else { vec![port] } {
            if super::bridge_get(p, &settings.token, "/v1/state", &[("enabled", en), ("port", &port_str)], 800).await.is_some() {
                state_ok = true;
                break;
            }
        }
        if enabled && !state_ok {
            for attempt in 0..8 {
                if attempt > 0 {
                    tokio::time::sleep(std::time::Duration::from_millis(280)).await;
                }
                if super::bridge_get(port, &settings.token, "/v1/health", &[], 400).await.is_some() {
                    break;
                }
            }
        }
    }
    Ok(super::get_bridge_status(config).await)
}

#[cfg(test)]
mod tests {
    use super::{BRIDGE_ASSETS, BRIDGE_ASSET_VERSION, ICON_JPG, INFO_JSON};

    #[test]
    fn embedded_bridge_metadata_and_icon_are_valid() {
        assert_eq!(BRIDGE_ASSET_VERSION, "2.3.3");
        assert!(ICON_JPG.len() <= 40 * 1024 && ICON_JPG.starts_with(&[0xff, 0xd8, 0xff]));
        assert!(BRIDGE_ASSETS.iter().any(|(p, _)| *p == "scripts/modmanager_bridge/info.json"));
        assert!(BRIDGE_ASSETS.iter().any(|(p, _)| *p == "scripts/modmanager_bridge/icon.jpg"));
        let v: serde_json::Value = serde_json::from_str(INFO_JSON).expect("valid info.json");
        assert_eq!(v["tagid"], "modmanager_bridge");
        assert_eq!(v["version_string"], "2.3.3");
        assert_eq!(v["version_string"], BRIDGE_ASSET_VERSION);
        assert_eq!(v["icon"], "icon.jpg");
        assert_eq!(v["status"], "Active");
        assert!(v["text"].as_str().is_some_and(|s| !s.trim().is_empty() && !s.contains("[ICODE]")));
    }
}
