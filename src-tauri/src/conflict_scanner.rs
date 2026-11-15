use crate::models::{BeamNGConfig, ConflictGroup, ScanReport};
use rayon::prelude::*;
use std::collections::HashMap;
use std::fs::{self, File};
use std::path::{Path, PathBuf};
use std::time::Instant;
use zip::ZipArchive;

struct ZipScanOutcome {
    filename: String,
    location: String,
    corrupt: bool,
    tag_id: Option<String>,
    files: Vec<String>,
}

pub fn scan_mods_health(config: &BeamNGConfig) -> Result<ScanReport, String> {
    let start = Instant::now();

    let mut targets: Vec<(PathBuf, String, String)> = Vec::new();
    collect_zip_paths(Path::new(&config.repo_path), "repo", &mut targets);
    collect_zip_paths(Path::new(&config.mods_path), "mods", &mut targets);

    let total_mods_scanned = targets.len();

    let outcomes: Vec<ZipScanOutcome> = targets
        .into_par_iter()
        .map(|(path, filename, location)| {
            let file = match File::open(&path) {
                Ok(f) => f,
                Err(_) => {
                    return ZipScanOutcome {
                        filename,
                        location,
                        corrupt: true,
                        tag_id: None,
                        files: Vec::new(),
                    };
                }
            };

            let mut archive = match ZipArchive::new(file) {
                Ok(a) => a,
                Err(_) => {
                    return ZipScanOutcome {
                        filename,
                        location,
                        corrupt: true,
                        tag_id: None,
                        files: Vec::new(),
                    };
                }
            };

            if archive.is_empty() {
                return ZipScanOutcome {
                    filename,
                    location,
                    corrupt: true,
                    tag_id: None,
                    files: Vec::new(),
                };
            }

            let mut files = Vec::new();
            let mut tag_id = None;

            for i in 0..archive.len() {
                if let Ok(entry) = archive.by_index_raw(i) {
                    if entry.is_dir() {
                        continue;
                    }
                    let normalized = entry
                        .name()
                        .replace('\\', "/")
                        .trim_start_matches('/')
                        .to_lowercase();

                    if normalized.starts_with("mod_info/") {
                        if normalized.ends_with("/info.json") {
                            let parts: Vec<&str> = normalized.split('/').collect();
                            if parts.len() >= 3 {
                                tag_id = Some(parts[1].to_uppercase());
                            }
                        }
                        continue;
                    }

                    if should_ignore_path(&normalized) {
                        continue;
                    }

                    files.push(normalized);
                }
            }

            ZipScanOutcome {
                filename,
                location,
                corrupt: false,
                tag_id,
                files,
            }
        })
        .collect();

    let mut corrupt_zips = Vec::new();
    let mut duplicate_mods = Vec::new();
    let mut by_stem: HashMap<String, Vec<String>> = HashMap::new();
    let mut by_tag: HashMap<String, Vec<String>> = HashMap::new();
    let mut file_to_mods: HashMap<String, Vec<String>> = HashMap::new();

    for out in outcomes {
        if out.corrupt {
            corrupt_zips.push(format!("{} ({})", out.filename, out.location));
            continue;
        }

        let stem = out
            .filename
            .strip_suffix(".zip")
            .or_else(|| out.filename.strip_suffix(".ZIP"))
            .unwrap_or(&out.filename)
            .to_lowercase();

        by_stem
            .entry(stem)
            .or_default()
            .push(format!("{}/{}", out.location, out.filename));

        if let Some(tid) = out.tag_id {
            by_tag
                .entry(tid)
                .or_default()
                .push(format!("{}/{}", out.location, out.filename));
        }

        for fp in out.files {
            file_to_mods.entry(fp).or_default().push(out.filename.clone());
        }
    }

    for (stem, locs) in by_stem {
        if locs.len() > 1 {
            duplicate_mods.push(format!("Duplicate filename ({}): {}", stem, locs.join(" & ")));
        }
    }

    for (tid, locs) in by_tag {
        if locs.len() > 1 {
            duplicate_mods.push(format!("Duplicate Repo ID ({}): {}", tid, locs.join(" & ")));
        }
    }

    let mut conflicts: Vec<ConflictGroup> = file_to_mods
        .into_iter()
        .filter_map(|(file_path, mut mods)| {
            mods.sort();
            mods.dedup();
            if mods.len() > 1 {
                let severity = classify_conflict_severity(&file_path);
                Some(ConflictGroup {
                    file_path,
                    severity,
                    mods,
                })
            } else {
                None
            }
        })
        .collect();

    conflicts.sort_by(|a, b| {
        severity_rank(&b.severity)
            .cmp(&severity_rank(&a.severity))
            .then_with(|| b.mods.len().cmp(&a.mods.len()))
            .then_with(|| a.file_path.cmp(&b.file_path))
    });

    if conflicts.len() > 250 {
        conflicts.truncate(250);
    }

    let scan_duration_ms = start.elapsed().as_millis() as u64;

    Ok(ScanReport {
        total_mods_scanned,
        scan_duration_ms,
        conflicts,
        corrupt_zips,
        duplicate_mods,
    })
}

fn collect_zip_paths(dir: &Path, location: &str, out: &mut Vec<(PathBuf, String, String)>) {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                    if ext.eq_ignore_ascii_case("zip") {
                        let fname = path
                            .file_name()
                            .and_then(|n| n.to_str())
                            .unwrap_or_default()
                            .to_string();
                        out.push((path, fname, location.to_string()));
                    }
                }
            }
        }
    }
}

fn should_ignore_path(path: &str) -> bool {
    path.is_empty()
        || path.starts_with("thumbs/")
        || path.ends_with("readme.txt")
        || path.ends_with("credits.txt")
        || path.ends_with("license.txt")
        || path.ends_with(".DS_Store")
        || path.ends_with("thumbs.db")
}

fn classify_conflict_severity(path: &str) -> String {
    if path.ends_with(".jbeam")
        || path.ends_with(".lua")
        || path.ends_with("main.level.json")
        || path.ends_with(".mis")
    {
        "high".to_string()
    } else if path.ends_with(".json")
        || path.ends_with(".pc")
        || path.ends_with(".sbeam")
        || path.ends_with(".dae")
        || path.ends_with(".cdae")
    {
        "medium".to_string()
    } else {
        "low".to_string()
    }
}

fn severity_rank(severity: &str) -> u8 {
    match severity {
        "high" => 3,
        "medium" => 2,
        _ => 1,
    }
}
