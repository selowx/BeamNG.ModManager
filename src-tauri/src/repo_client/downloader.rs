#[path = "downloader_post_install.rs"]
mod post_install;

use super::download_throttle::DownloadRateLimiter;
use super::parser::{parse_mod_details_html, resolve_zip_filename, BASE_URL};
use super::{rate_limit_wait, HTTP_CLIENT};
use crate::beamng_env::detect_beamng_config;
use crate::models::{BeamNGConfig, RepoModDetails};
use futures_util::StreamExt;
use reqwest::header::{CONTENT_RANGE, RANGE, REFERER};
use reqwest::StatusCode;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::AppHandle;
use tokio::sync::watch;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TransferSignal { Running, Paused, Cancelled }

#[derive(Debug, Clone)]
pub struct InstalledModOutcome { pub local_mod_id: String, pub final_filename: String, pub size_bytes: u64, pub status: String }

#[derive(Debug, Clone)]
pub enum DownloadOutcome {
    Completed(InstalledModOutcome),
    Paused { downloaded_bytes: u64, total_bytes: u64, part_path: Option<PathBuf>, filename: String },
    Cancelled,
}

#[derive(Debug, Clone)]
pub struct DownloadProgressUpdate {
    pub filename: String, pub downloaded_bytes: u64, pub total_bytes: u64, pub speed_bps: u64,
    pub status: String, pub message: Option<String>, pub part_path: Option<String>,
}

fn check_rate_limit(status: StatusCode) -> Result<(), String> {
    if matches!(status.as_u16(), 429 | 503) {
        super::trigger_rate_limit_cooldown();
        return Err("BeamNG Repository rate limit reached. Cooling down for 15 seconds...".into());
    }
    Ok(())
}

fn sanitize_zip_name(raw: &str, fallback_id: u64) -> String {
    let base = raw.trim().rsplit(['/', '\\']).next().unwrap_or_default().trim();
    let clean: String = base.chars().map(|c| if "<>:\"/\\|?*".contains(c) { '_' } else { c }).collect();
    if clean.is_empty() || clean == "." || clean == ".." || clean.contains("..") { return format!("mod_{}.zip", fallback_id); }
    if clean.to_lowercase().ends_with(".zip") { clean } else { format!("{}.zip", clean) }
}

fn validate_beamng_https_url(raw: &str) -> Result<(), String> {
    let parsed = reqwest::Url::parse(raw).map_err(|_| "Invalid download URL.".to_string())?;
    let host_ok = matches!(parsed.host_str(), Some("api.beamng.com" | "www.beamng.com"));
    if parsed.scheme() != "https" || !host_ok { return Err("Blocked non-BeamNG download URL.".into()); }
    Ok(())
}

fn bridge_dl_details(resource_id: u64, clean_slug: &str, title: &str, dl_url: &str) -> RepoModDetails {
    let tag_id = clean_slug.trim_matches('/').strip_prefix("bridge/").map(|s| s.to_string());
    RepoModDetails {
        resource_id, slug: clean_slug.into(), title: title.into(), version: String::new(), author: String::new(),
        tagline: String::new(), description_text: String::new(), description_html: String::new(), recent_updates: Vec::new(),
        category: "Mod".into(), rating: 0.0, downloads: 0, file_size_text: String::new(), tag_id,
        download_url: Some(dl_url.into()), icon_url: String::new(), gallery_images: Vec::new(),
        install_status: "not_installed".into(), installed_version: None, subscribed: None,
    }
}

async fn resolve_download_target(
    config: &BeamNGConfig, clean_slug: &str, resource_id: u64, title: &str,
) -> Result<(String, String, Option<String>, RepoModDetails), String> {
    if clean_slug.starts_with("bridge/") {
        let (dl_url, file) = crate::bridge_client::resolve_bridge_download(config, clean_slug).await
            .ok_or_else(|| "Direct ZIP download link not found for this bridge mod.".to_string())?;
        validate_beamng_https_url(&dl_url)?;
        return Ok((dl_url.clone(), String::new(), Some(file), bridge_dl_details(0, clean_slug, title, &dl_url)));
    }
    if crate::bridge_client::is_bridge_enabled(config) {
        let local = crate::local_mods::get_cached_or_list_local_mods(config).unwrap_or_default();
        if let Some((dl_url, file)) = crate::bridge_client::resolve_bridge_download_by_id(config, resource_id, clean_slug, &local).await {
            validate_beamng_https_url(&dl_url)?;
            return Ok((dl_url.clone(), String::new(), Some(file), bridge_dl_details(resource_id, clean_slug, title, &dl_url)));
        }
    }
    rate_limit_wait().await;
    let resp = HTTP_CLIENT.get(format!("{}{}", BASE_URL, clean_slug)).timeout(Duration::from_secs(30)).send().await
        .map_err(|e| format!("Failed to open mod page: {}", e))?;
    check_rate_limit(resp.status())?;
    if !resp.status().is_success() { return Err(format!("Mod page server error: HTTP {}", resp.status().as_u16())); }
    let referer = resp.url().to_string();
    let html = resp.text().await.map_err(|e| e.to_string())?;
    let (mut details, _) = parse_mod_details_html(&html, clean_slug, resource_id);
    let dl_url = details.download_url.take().ok_or_else(|| "Direct ZIP download link not found for this mod.".to_string())?;
    validate_beamng_https_url(&dl_url)?;
    Ok((dl_url, referer, None, details))
}

async fn wait_until_stopped(rx: &mut watch::Receiver<TransferSignal>) -> TransferSignal {
    loop {
        let current = *rx.borrow();
        if current != TransferSignal::Running { return current; }
        if rx.changed().await.is_err() { return TransferSignal::Cancelled; }
    }
}

fn stop_outcome(sig: TransferSignal, downloaded: u64, total: u64, part_path: &mut Option<PathBuf>, filename: String) -> DownloadOutcome {
    if sig == TransferSignal::Paused {
        DownloadOutcome::Paused { downloaded_bytes: downloaded, total_bytes: total, part_path: part_path.clone(), filename }
    } else {
        if let Some(p) = part_path.take() { let _ = fs::remove_file(p); }
        DownloadOutcome::Cancelled
    }
}

fn verify_zip_part(part_path: &Path) -> Result<(), String> {
    let meta = fs::metadata(part_path).map_err(|e| format!("Failed to inspect downloaded file: {}", e))?;
    if meta.len() < 4 { return Err("Downloaded archive is empty or truncated.".into()); }
    let mut magic = [0u8; 4];
    File::open(part_path).map_err(|e| format!("Failed to open downloaded file: {}", e))?
        .read_exact(&mut magic).map_err(|e| format!("Failed to read ZIP header: {}", e))?;
    if &magic[..2] != b"PK" { return Err("Downloaded file is not a valid ZIP archive (invalid magic header).".into()); }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
pub async fn run_download<F>(
    app: &AppHandle, task_id: &str, resource_id: u64, slug: &str, title: &str,
    initial_part_path: Option<PathBuf>, initial_filename: Option<String>, initial_total_bytes: u64,
    post_download_mode: &str, add_to_active_profile: bool,
    rate_limiter: Arc<DownloadRateLimiter>, mut signal_rx: watch::Receiver<TransferSignal>, mut on_progress: F,
) -> Result<DownloadOutcome, String>
where F: FnMut(DownloadProgressUpdate) + Send,
{
    let mut filename = initial_filename.unwrap_or_default();
    let mut part_path = initial_part_path.filter(|p| p.exists());
    let mut downloaded_bytes = part_path.as_ref().and_then(|p| fs::metadata(p).ok()).map(|m| m.len()).unwrap_or(0);
    if downloaded_bytes == 0 { part_path = None; }
    if filename.is_empty() {
        if let Some(name) = part_path.as_ref().and_then(|p| p.file_name()).and_then(|n| n.to_str()) {
            filename = name.strip_suffix(".part").or_else(|| name.strip_suffix(".PART")).unwrap_or(name).to_string();
        }
    }
    let mut total_bytes = initial_total_bytes;
    let mut emit = |fnm: &str, dl: u64, tot: u64, spd: u64, st: &str, msg: Option<String>, pp: Option<&PathBuf>| {
        post_install::emit_dl_event(app, task_id, resource_id, title, fnm, dl, tot, spd, st, msg.clone());
        on_progress(DownloadProgressUpdate {
            filename: fnm.into(), downloaded_bytes: dl, total_bytes: tot, speed_bps: spd,
            status: st.into(), message: msg, part_path: pp.map(|p| p.to_string_lossy().into()),
        });
    };
    if *signal_rx.borrow() != TransferSignal::Running {
        return Ok(stop_outcome(*signal_rx.borrow(), downloaded_bytes, total_bytes, &mut part_path, filename));
    }
    let config = detect_beamng_config()?;
    let staging_dir = PathBuf::from(&config.staging_path);
    let _ = fs::create_dir_all(&staging_dir);
    let clean_slug = if slug.trim().is_empty() { format!("resources/{}/", resource_id) } else { slug.trim_start_matches('/').to_string() };

    emit(&filename, downloaded_bytes, total_bytes, 0, "resolving", Some("Resolving download link...".into()), part_path.as_ref());
    let (dl_url, canonical_referer, preferred_filename, details) = tokio::select! {
        res = resolve_download_target(&config, &clean_slug, resource_id, title) => res?,
        sig = wait_until_stopped(&mut signal_rx) => return Ok(stop_outcome(sig, downloaded_bytes, total_bytes, &mut part_path, filename)),
    };

    let (session_start, mut session_bytes, mut last_emit) = (Instant::now(), 0u64, Instant::now());
    for attempt in 0..3 {
        if *signal_rx.borrow() != TransferSignal::Running {
            return Ok(stop_outcome(*signal_rx.borrow(), downloaded_bytes, total_bytes, &mut part_path, filename));
        }
        rate_limit_wait().await;
        let mut req = HTTP_CLIENT.get(&dl_url);
        if !canonical_referer.is_empty() { req = req.header(REFERER, &canonical_referer); }
        if downloaded_bytes > 0 { req = req.header(RANGE, format!("bytes={}-", downloaded_bytes)); }
        let response = match req.send().await {
            Ok(r) => r, Err(_) if attempt < 2 => continue, Err(e) => return Err(format!("Failed to start download: {}", e)),
        };
        let dl_status = response.status();
        check_rate_limit(dl_status)?;
        if dl_status == StatusCode::RANGE_NOT_SATISFIABLE && downloaded_bytes > 0 && attempt < 2 {
            downloaded_bytes = 0; if let Some(pp) = part_path.take() { let _ = fs::remove_file(pp); } continue;
        }
        if !dl_status.is_success() {
            if dl_status.is_server_error() && attempt < 2 { continue; }
            return Err(format!("Server error: HTTP {}", dl_status.as_u16()));
        }
        if filename.is_empty() {
            let raw = preferred_filename.clone().unwrap_or_else(|| resolve_zip_filename(&response, &clean_slug, resource_id));
            filename = sanitize_zip_name(&raw, resource_id);
        }
        let pp = part_path.get_or_insert_with(|| staging_dir.join(format!("{}.part", filename))).clone();
        let mut file = if dl_status == StatusCode::PARTIAL_CONTENT && downloaded_bytes > 0 && pp.exists() {
            if total_bytes == 0 {
                total_bytes = response.headers().get(CONTENT_RANGE).and_then(|v| v.to_str().ok())
                    .and_then(|s| s.rsplit('/').next()?.trim().parse::<u64>().ok())
                    .unwrap_or(downloaded_bytes + response.content_length().unwrap_or(0));
            }
            fs::OpenOptions::new().append(true).open(&pp).map_err(|e| format!("Failed to reopen temporary file: {}", e))?
        } else {
            downloaded_bytes = 0;
            if let Some(len) = response.content_length() { total_bytes = len; }
            File::create(&pp).map_err(|e| format!("Failed to create temporary file: {}", e))?
        };
        emit(&filename, downloaded_bytes, total_bytes, 0, "downloading", None, part_path.as_ref());

        let (mut stream, mut retry_needed) = (response.bytes_stream(), false);
        loop {
            let next_chunk = tokio::select! {
                res = tokio::time::timeout(Duration::from_secs(45), stream.next()) => res,
                sig = wait_until_stopped(&mut signal_rx) => {
                    let _ = file.flush(); drop(file);
                    return Ok(stop_outcome(sig, downloaded_bytes, total_bytes, &mut part_path, filename));
                }
            };
            match next_chunk {
                Err(_) if attempt < 2 => { retry_needed = true; break; }
                Err(_) => return Err("Download timed out: no data received for 45s".into()),
                Ok(None) => break,
                Ok(Some(Err(_))) if attempt < 2 => { retry_needed = true; break; }
                Ok(Some(Err(e))) => return Err(format!("Download stream interrupted: {}", e)),
                Ok(Some(Ok(chunk))) => {
                    file.write_all(&chunk).map_err(|e| format!("Disk write error: {}", e))?;
                    downloaded_bytes += chunk.len() as u64; session_bytes += chunk.len() as u64;
                    tokio::select! {
                        _ = rate_limiter.acquire(chunk.len()) => {},
                        sig = wait_until_stopped(&mut signal_rx) => {
                            let _ = file.flush(); drop(file);
                            return Ok(stop_outcome(sig, downloaded_bytes, total_bytes, &mut part_path, filename));
                        }
                    }
                    if last_emit.elapsed() >= Duration::from_millis(120) {
                        let spd = (session_bytes as f64 / session_start.elapsed().as_secs_f64().max(0.1)) as u64;
                        emit(&filename, downloaded_bytes, total_bytes, spd, "downloading", None, part_path.as_ref());
                        last_emit = Instant::now();
                    }
                }
            }
        }
        file.flush().map_err(|e| e.to_string())?; drop(file);
        if retry_needed || (total_bytes > 0 && downloaded_bytes < total_bytes) {
            if attempt < 2 { continue; }
            return Err(format!("Incomplete download ({} / {} bytes)", downloaded_bytes, total_bytes));
        }
        break;
    }

    let final_part = part_path.take().ok_or_else(|| "Download did not produce a file.".to_string())?;
    emit(&filename, downloaded_bytes, total_bytes.max(downloaded_bytes), 0, "verifying", Some("Verifying archive integrity...".into()), Some(&final_part));
    if let Err(err) = verify_zip_part(&final_part) { let _ = fs::remove_file(&final_part); return Err(err); }

    let real_rid = if clean_slug.starts_with("bridge/") { 0 } else { resource_id };
    let outcome = post_install::finalize_downloaded_file(&config, &final_part, &filename, real_rid, &details, post_download_mode, add_to_active_profile)?;
    let msg = if outcome.status == "staged" { "Queued in staging because BeamNG.drive is running." }
        else if post_download_mode.eq_ignore_ascii_case("disabled") { "Installed to mods_disabled." }
        else { "Installed directly to mods/repo." };
    emit(&outcome.final_filename, downloaded_bytes.max(total_bytes), downloaded_bytes.max(total_bytes), 0, &outcome.status, Some(msg.into()), None);
    Ok(DownloadOutcome::Completed(outcome))
}
