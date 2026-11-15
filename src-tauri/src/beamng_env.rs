use crate::models::{BeamNGConfig, ManagerStateFile};
use std::env;
use std::fs;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;

const CREATE_NO_WINDOW: u32 = 0x08000000;

pub fn detect_beamng_config() -> Result<BeamNGConfig, String> {
    let local_app_data = env::var("LOCALAPPDATA").map_err(|e| e.to_string())?;
    let base_beamng = PathBuf::from(&local_app_data).join("BeamNG");
    let ini_path = base_beamng.join("BeamNG.drive.ini");

    let mut version = String::from("0.40.5.0");
    let mut install_path = String::from(r"D:\SteamLibrary\steamapps\common\BeamNG.drive\");

    if ini_path.exists() {
        if let Ok(content) = fs::read_to_string(&ini_path) {
            for line in content.lines() {
                let parts: Vec<&str> = line.splitn(2, '=').collect();
                if parts.len() == 2 {
                    let key = parts[0].trim();
                    let val = parts[1].trim();
                    if key == "version" {
                        version = val.to_string();
                    } else if key == "installPath" {
                        install_path = val.to_string();
                    }
                }
            }
        }
    }

    if !Path::new(&install_path).exists() {
        if let Some(steam_path) = find_steam_beamng_install() {
            install_path = steam_path;
        }
    }

    let user_path = {
        let modern_current = base_beamng.join("BeamNG.drive").join("current");
        if modern_current.exists() {
            modern_current
        } else {
            let legacy = PathBuf::from(&local_app_data).join("BeamNG.drive").join(&version);
            if legacy.exists() {
                legacy
            } else {
                modern_current
            }
        }
    };

    let mods_path = user_path.join("mods");
    let repo_path = mods_path.join("repo");
    let disabled_path = user_path.join("mods_disabled");
    let staging_path = user_path.join("mods_staging");
    let db_json_path = mods_path.join("db.json");

    let _ = fs::create_dir_all(&mods_path);
    let _ = fs::create_dir_all(&repo_path);
    let _ = fs::create_dir_all(&disabled_path);
    let _ = fs::create_dir_all(&staging_path);

    let staged_count = count_zip_files(&staging_path);
    let game_running = is_game_running();

    Ok(BeamNGConfig {
        version,
        install_path,
        user_path: user_path.to_string_lossy().to_string(),
        mods_path: mods_path.to_string_lossy().to_string(),
        repo_path: repo_path.to_string_lossy().to_string(),
        disabled_path: disabled_path.to_string_lossy().to_string(),
        staging_path: staging_path.to_string_lossy().to_string(),
        db_json_path: db_json_path.to_string_lossy().to_string(),
        game_running,
        staged_count,
    })
}

pub fn count_zip_files(dir: &Path) -> usize {
    if let Ok(entries) = fs::read_dir(dir) {
        entries
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.path()
                    .extension()
                    .and_then(|ext| ext.to_str())
                    .map(|ext| ext.eq_ignore_ascii_case("zip"))
                    .unwrap_or(false)
            })
            .count()
    } else {
        0
    }
}

pub fn is_game_running() -> bool {
    static CACHE: once_cell::sync::Lazy<std::sync::Mutex<Option<(std::time::Instant, bool)>>> =
        once_cell::sync::Lazy::new(|| std::sync::Mutex::new(None));

    if let Ok(guard) = CACHE.lock() {
        if let Some((ts, running)) = *guard {
            if ts.elapsed() < std::time::Duration::from_secs(3) {
                return running;
            }
        }
    }

    let running = if let Ok(output) = Command::new("tasklist")
        .args(["/FI", "IMAGENAME eq BeamNG.drive.x64.exe", "/NH"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
    {
        let stdout = String::from_utf8_lossy(&output.stdout);
        stdout.contains("BeamNG.drive.x64.exe")
    } else {
        false
    };

    if let Ok(mut guard) = CACHE.lock() {
        *guard = Some((std::time::Instant::now(), running));
    }

    running
}

fn find_steam_beamng_install() -> Option<String> {
    let default_steam_beamng =
        Path::new(r"C:\Program Files (x86)\Steam\steamapps\common\BeamNG.drive");
    if default_steam_beamng.exists() {
        return Some(default_steam_beamng.to_string_lossy().to_string());
    }

    let libraryfolders_path =
        Path::new(r"C:\Program Files (x86)\Steam\steamapps\libraryfolders.vdf");
    if libraryfolders_path.exists() {
        if let Ok(content) = fs::read_to_string(libraryfolders_path) {
            for line in content.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with("\"path\"") {
                    let parts: Vec<&str> = trimmed.split('"').collect();
                    if parts.len() >= 4 {
                        let library_path = parts[3].replace(r"\\", r"\");
                        let candidate = PathBuf::from(&library_path)
                            .join("steamapps")
                            .join("common")
                            .join("BeamNG.drive");
                        if candidate.exists() {
                            return Some(candidate.to_string_lossy().to_string());
                        }
                    }
                }
            }
        }
    }

    None
}

pub fn state_file_path(user_path: &str) -> PathBuf {
    PathBuf::from(user_path).join("modmanager_state.json")
}

pub fn load_manager_state(user_path: &str) -> ManagerStateFile {
    let path = state_file_path(user_path);
    if let Ok(content) = fs::read_to_string(&path) {
        if let Ok(state) = serde_json::from_str::<ManagerStateFile>(&content) {
            return state;
        }
    }
    // Default pinned mods for known essential packs (like RLS Career)
    ManagerStateFile {
        pinned_mods: vec![
            "rls_repo_mod_manager_1.0.1".to_string(),
            "rls_career_collection_5.11".to_string(),
        ],
        ..Default::default()
    }
}

pub fn save_manager_state(user_path: &str, state: &ManagerStateFile) -> Result<(), String> {
    let path = state_file_path(user_path);
    let json = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

pub fn launch_beamng(install_path: &str, mode: &str) -> Result<(), String> {
    if mode.eq_ignore_ascii_case("direct") {
        let exe_path = PathBuf::from(install_path).join("BeamNG.drive.exe");
        if exe_path.exists() {
            Command::new(exe_path)
                .spawn()
                .map_err(|e| format!("Failed to launch BeamNG: {}", e))?;
            return Ok(());
        }
    }
    Command::new("cmd")
        .args(["/C", "start", "steam://rungameid/284160"])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Failed to launch via Steam: {}", e))?;
    Ok(())
}

pub fn open_in_explorer(folder_path: &str) -> Result<(), String> {
    Command::new("explorer")
        .arg(folder_path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn open_url_in_browser(url: &str) -> Result<(), String> {
    if !url.starts_with("https://www.beamng.com/") {
        return Err("Only official BeamNG URLs can be opened.".to_string());
    }
    Command::new("explorer")
        .arg(url)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}
