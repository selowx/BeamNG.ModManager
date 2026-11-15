use crate::models::CachedModMeta;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde_json::Value;
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use zip::ZipArchive;

#[derive(Debug, Clone)]
pub struct RawDiskZip {
    pub mod_id: String,
    pub filename: String,
    pub full_path: PathBuf,
    pub location: String,
    pub size_bytes: u64,
    pub modified_ts: u64,
}

pub fn collect_zips_in_dir(dir: &Path, location: &str, out: &mut Vec<RawDiskZip>) {
    let Ok(entries) = fs::read_dir(dir) else { return; };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() { continue; }
        let Some(ext) = path.extension().and_then(|e| e.to_str()) else { continue; };
        if !ext.eq_ignore_ascii_case("zip") { continue; }
        let filename = path.file_name().and_then(|n| n.to_str()).unwrap_or_default().to_string();
        let mod_id = filename.strip_suffix(".zip").or_else(|| filename.strip_suffix(".ZIP")).unwrap_or(&filename).to_lowercase();
        let meta = fs::metadata(&path).ok();
        let size_bytes = meta.as_ref().map(|m| m.len()).unwrap_or(0);
        let modified_ts = meta.and_then(|m| m.modified().ok()).and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_secs()).unwrap_or(0);
        out.push(RawDiskZip { mod_id, filename, full_path: path, location: location.to_string(), size_bytes, modified_ts });
    }
}

pub fn collect_unpacked_in_dir(unpacked_dir: &Path, out: &mut Vec<RawDiskZip>) {
    let Ok(entries) = fs::read_dir(unpacked_dir) else { return; };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() { continue; }
        let Some(dirname) = path.file_name().and_then(|n| n.to_str()).map(|s| s.to_string()) else { continue; };
        if dirname.eq_ignore_ascii_case("modmanager_bridge") { continue; }
        let mod_id = dirname.to_lowercase();
        let meta = fs::metadata(&path).ok();
        let modified_ts = meta.and_then(|m| m.modified().ok()).and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_secs()).unwrap_or(0);
        out.push(RawDiskZip { mod_id, filename: dirname, full_path: path, location: "unpacked".to_string(), size_bytes: 0, modified_ts });
    }
}

pub fn normalize_mod_category(raw: &str) -> String {
    let l = raw.trim().to_lowercase();
    if l.contains("skin") || l.contains("paint") || l.contains("livery") { "skin" }
    else if l.contains("scenario") || l.contains("mission") || l.contains("campaign") { "scenario" }
    else if l.contains("terrain") || l.contains("level") || l.contains("map") || l.contains("track") { "terrain" }
    else if l.contains("vehic") || l.contains("car") || l.contains("truck") || l.contains("bus") || l.contains("automation") { "vehicle" }
    else if l.contains("app") || l.contains("ui") || l.contains("interface") { "app" }
    else if l.contains("sound") || l.contains("audio") { "sound" }
    else { "other" }.to_string()
}

fn read_zip_entry_as_base64(archive: &mut ZipArchive<File>, entry_name: &str) -> Option<String> {
    let mut entry = archive.by_name(entry_name).ok()?;
    let mut bytes = Vec::new();
    entry.read_to_end(&mut bytes).ok()?;
    if bytes.is_empty() { return None; }
    let mime = if entry_name.to_lowercase().ends_with(".png") { "image/png" } else { "image/jpeg" };
    Some(format!("data:{};base64,{}", mime, BASE64.encode(&bytes)))
}

fn find_icon_entry(archive: &mut ZipArchive<File>) -> Option<String> {
    let mut candidate = None;
    for i in 0..archive.len() {
        if let Ok(entry) = archive.by_index_raw(i) {
            let l = entry.name().replace('\\', "/").to_lowercase();
            if entry.size() <= 350_000 {
                if l.starts_with("mod_info/") && (l.ends_with("/icon.jpg") || l.ends_with("/icon.png")) { return Some(entry.name().to_string()); }
                if candidate.is_none() && (l.contains("vehicles/") || l.contains("levels/")) && (l.ends_with("/default.png") || l.ends_with("/default.jpg") || l.ends_with("/icon.png") || l.ends_with("/icon.jpg")) {
                    candidate = Some(entry.name().to_string());
                }
            }
        }
    }
    candidate
}

pub fn extract_zip_icon_base64(zip_path: &Path) -> Option<String> {
    let file = File::open(zip_path).ok()?;
    let mut archive = ZipArchive::new(file).ok()?;
    let entry_name = find_icon_entry(&mut archive)?;
    read_zip_entry_as_base64(&mut archive, &entry_name)
}

pub fn decode_html_entities(input: &str) -> String {
    if !input.contains('&') { return input.to_string(); }
    let (mut out, mut rest) = (String::with_capacity(input.len()), input);
    while let Some(amp) = rest.find('&') {
        out.push_str(&rest[..amp]);
        let after = &rest[amp..];
        if let Some(semi) = after[1..].find(';').filter(|&p| p <= 10) {
            let ent = &after[1..1 + semi];
            let ch = match ent {
                "amp" => Some('&'), "lt" => Some('<'), "gt" => Some('>'),
                "quot" => Some('"'), "apos" => Some('\''), "nbsp" => Some(' '),
                _ if ent.starts_with("#x") || ent.starts_with("#X") => u32::from_str_radix(&ent[2..], 16).ok().and_then(char::from_u32),
                _ if ent.starts_with('#') => ent[1..].parse::<u32>().ok().and_then(char::from_u32),
                _ => None,
            };
            if let Some(c) = ch { out.push(c); rest = &after[2 + semi..]; continue; }
        }
        out.push('&');
        rest = &after[1..];
    }
    out.push_str(rest);
    out
}

pub fn decode_mod_text(raw: &str) -> String {
    if !raw.contains("\\u") { return decode_html_entities(raw); }
    let (mut out, bytes, mut i) = (String::with_capacity(raw.len()), raw.as_bytes(), 0);
    while i < bytes.len() {
        if bytes[i] == b'\\' && i + 5 < bytes.len() && bytes[i + 1] == b'u' && bytes[i + 2..i + 6].iter().all(|b| b.is_ascii_hexdigit()) {
            if let Ok(code) = u16::from_str_radix(&raw[i + 2..i + 6], 16) {
                if (0xD800..=0xDBFF).contains(&code) && i + 11 < bytes.len() && bytes[i + 6..i + 8] == *b"\\u" && bytes[i + 8..i + 12].iter().all(|b| b.is_ascii_hexdigit()) {
                    if let Some(ch) = u16::from_str_radix(&raw[i + 8..i + 12], 16).ok().filter(|l| (0xDC00..=0xDFFF).contains(l))
                        .and_then(|low| char::from_u32(0x10000 + (((code as u32 - 0xD800) << 10) | (low as u32 - 0xDC00)))) {
                        out.push(ch); i += 12; continue;
                    }
                }
                if let Some(ch) = char::from_u32(code as u32) { out.push(ch); i += 6; continue; }
            }
        }
        let ch = raw[i..].chars().next().unwrap();
        out.push(ch);
        i += ch.len_utf8();
    }
    decode_html_entities(&out)
}

fn populate_from_info_json(val: &Value, title: &mut String, author: &mut String, ver: &mut String, cat: &mut String, tag: &mut Option<String>, rid: &mut Option<u64>, lu: &mut Option<u64>) {
    if let Some(t) = val.get("title").and_then(|v| v.as_str()).filter(|s| !s.trim().is_empty()) { *title = decode_mod_text(t.trim()); }
    if let Some(u) = val.get("username").and_then(|v| v.as_str()).filter(|s| !s.trim().is_empty()) { *author = decode_mod_text(u.trim()); }
    if let Some(v) = val.get("version_string").and_then(|v| v.as_str()).filter(|s| !s.trim().is_empty()) { *ver = v.trim().to_string(); }
    if let Some(c) = val.get("category").or_else(|| val.get("modType")).and_then(|v| v.as_str()) { *cat = normalize_mod_category(c); }
    if let Some(r) = val.get("resource_id").and_then(|v| v.as_u64()) { *rid = Some(r); }
    if let Some(l) = val.get("last_update").and_then(|v| v.as_u64()) { *lu = Some(l); }
    if let Some(t) = val.get("tagid").and_then(|v| v.as_str()).filter(|s| !s.trim().is_empty()) { *tag = Some(t.trim().to_string()); }
}

pub fn inspect_unpacked_dir_metadata(dir_path: &Path, folder_name: &str) -> CachedModMeta {
    let mut title = prettify_mod_name(folder_name);
    let mut author = String::from("Unpacked Mod");
    let mut version = String::from("1.0");
    let (mut tag_id, mut resource_id, mut last_update, mut icon_url) = (None, None, None, None);
    let mut category = String::from("other");

    let mod_info = dir_path.join("mod_info");
    if let Ok(entries) = fs::read_dir(&mod_info) {
        for entry in entries.flatten() {
            let p = entry.path();
            if !p.is_dir() { continue; }
            if tag_id.is_none() { tag_id = p.file_name().and_then(|n| n.to_str()).map(|s| s.to_uppercase()); }
            if let Ok(content) = fs::read_to_string(p.join("info.json")) {
                if let Ok(val) = serde_json::from_str::<Value>(&content) {
                    populate_from_info_json(&val, &mut title, &mut author, &mut version, &mut category, &mut tag_id, &mut resource_id, &mut last_update);
                }
            }
            if icon_url.is_none() {
                for icon_name in &["icon.jpg", "icon.png"] {
                    if let Some(bytes) = fs::read(p.join(icon_name)).ok().filter(|b| !b.is_empty()) {
                        let mime = if icon_name.ends_with(".png") { "image/png" } else { "image/jpeg" };
                        icon_url = Some(format!("data:{};base64,{}", mime, BASE64.encode(&bytes)));
                        break;
                    }
                }
            }
        }
    }

    if category == "other" {
        category = if dir_path.join("vehicles").exists() { "vehicle" }
        else if dir_path.join("levels").exists() { "terrain" }
        else if dir_path.join("scenarios").exists() { "scenario" }
        else if dir_path.join("ui").exists() { "app" } else { "other" }.to_string();
    }

    CachedModMeta { title, author, version, tag_id, resource_id, category, last_update, icon_url, size_bytes: None, modified_ts: None }
}

pub fn inspect_zip_metadata(zip_path: &Path, filename: &str) -> Option<CachedModMeta> {
    let file = File::open(zip_path).ok()?;
    let mut archive = ZipArchive::new(file).ok()?;
    let mut title = prettify_mod_name(filename);
    let mut author = String::from("Community Mod");
    let mut version = extract_version_from_filename(filename).unwrap_or_else(|| "1.0".to_string());
    let (mut tag_id, mut resource_id, mut last_update) = (None, None, None);
    let mut category = String::from("other");
    let (mut has_vehicle, mut has_level, mut has_scenario, mut has_skin, mut has_ui, mut has_sound) = (false, false, false, false, false, false);
    let mut info_json_name: Option<String> = None;

    for i in 0..archive.len() {
        if let Ok(entry) = archive.by_index_raw(i) {
            let name = entry.name().replace('\\', "/");
            let l = name.to_lowercase();
            if l.starts_with("mod_info/") && l.ends_with("/info.json") {
                info_json_name = Some(entry.name().to_string());
                let parts: Vec<&str> = name.split('/').collect();
                if parts.len() >= 3 { tag_id = Some(parts[1].to_uppercase()); }
            }
            if l.contains(".skin.jbeam") || l.contains("skins/") || l.contains("/skin/") { has_skin = true; }
            if l.contains("scenarios/") || l.ends_with(".flow.json") { has_scenario = true; }
            if l.contains("vehicles/") || l.ends_with(".jbeam") { has_vehicle = true; }
            if l.contains("levels/") || l.ends_with(".level.json") || l.ends_with(".mis") { has_level = true; }
            if l.starts_with("ui/") || l.contains("/ui/") { has_ui = true; }
            if l.ends_with(".sbeam") || l.contains("art/sound") { has_sound = true; }
        }
    }

    if let Some(info_name) = info_json_name {
        if let Ok(mut entry) = archive.by_name(&info_name) {
            let mut buf = String::new();
            if entry.read_to_string(&mut buf).is_ok() {
                if let Ok(val) = serde_json::from_str::<Value>(&buf) {
                    populate_from_info_json(&val, &mut title, &mut author, &mut version, &mut category, &mut tag_id, &mut resource_id, &mut last_update);
                }
            }
        }
    }

    if category == "other" {
        category = if has_skin { "skin" } else if has_scenario { "scenario" } else if has_level { "terrain" } else if has_vehicle { "vehicle" } else if has_ui { "app" } else if has_sound { "sound" } else { "other" }.to_string();
    }

    let icon_entry = find_icon_entry(&mut archive);
    let icon_url = icon_entry.as_deref().and_then(|name| read_zip_entry_as_base64(&mut archive, name));

    Some(CachedModMeta { title, author, version, tag_id, resource_id, category, last_update, icon_url, size_bytes: None, modified_ts: None })
}

pub fn prettify_mod_name(filename: &str) -> String {
    let stem = filename.strip_suffix(".zip").or_else(|| filename.strip_suffix(".ZIP")).unwrap_or(filename);
    stem.replace(['_', '-'], " ")
}

pub fn extract_version_from_filename(filename: &str) -> Option<String> {
    let stem = filename.strip_suffix(".zip").or_else(|| filename.strip_suffix(".ZIP")).unwrap_or(filename);
    for part in stem.split(|c| c == '_' || c == ' ' || c == '-') {
        let trimmed = part.trim_start_matches(['v', 'V']);
        if !trimmed.is_empty() && trimmed.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false) && trimmed.contains('.') {
            return Some(trimmed.to_string());
        }
    }
    None
}

pub fn has_repo_manifest(zip_path: &Path) -> bool {
    let Ok(file) = File::open(zip_path) else { return false; };
    let Ok(mut archive) = ZipArchive::new(file) else { return false; };
    for i in 0..archive.len() {
        if let Ok(entry) = archive.by_index_raw(i) {
            let lower = entry.name().replace('\\', "/").to_lowercase();
            if lower.starts_with("mod_info/") && lower.ends_with("/info.json") { return true; }
        }
    }
    false
}

pub fn find_mod_zip_in_active_dirs(repo_dir: &Path, mods_dir: &Path, mod_id: &str) -> Option<(PathBuf, String)> {
    find_zip_by_mod_id(repo_dir, mod_id).map(|p| (p, "repo".to_string()))
        .or_else(|| find_zip_by_mod_id(mods_dir, mod_id).map(|p| (p, "mods".to_string())))
}

pub fn find_zip_by_mod_id(dir: &Path, mod_id: &str) -> Option<PathBuf> {
    let entries = fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if let Some(fname) = path.file_name().and_then(|n| n.to_str()) {
            let stem = fname.strip_suffix(".zip").or_else(|| fname.strip_suffix(".ZIP")).unwrap_or(fname).to_lowercase();
            if stem == mod_id { return Some(path); }
        }
    }
    None
}
