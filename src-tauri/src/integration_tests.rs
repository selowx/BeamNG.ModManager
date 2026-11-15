use crate::beamng_env::detect_beamng_config;
use crate::conflict_scanner::scan_mods_health;
use crate::local_mods::list_local_mods;
use std::path::Path;

#[test]
fn verify_real_beamng_integration() {
    let cfg = detect_beamng_config().expect("detect_beamng_config failed");
    assert!(
        Path::new(&cfg.mods_path).exists(),
        "mods_path does not exist: {}",
        cfg.mods_path
    );
    println!("BeamNG version detected: {}", cfg.version);
    println!("Mods path: {}", cfg.mods_path);

    let mods = list_local_mods(&cfg).expect("list_local_mods failed");
    let active_count = mods.iter().filter(|m| m.active).count();
    let disabled_count = mods.len() - active_count;
    println!(
        "Total local mods found: {} (Active: {}, Disabled: {})",
        mods.len(),
        active_count,
        disabled_count
    );

    let report = scan_mods_health(&cfg).expect("scan_mods_health failed");
    println!(
        "Scan summary: total_mods_scanned = {}, scan_duration_ms = {}ms, conflicts = {}, corrupt_zips = {}, duplicate_mods = {}",
        report.total_mods_scanned,
        report.scan_duration_ms,
        report.conflicts.len(),
        report.corrupt_zips.len(),
        report.duplicate_mods.len()
    );
}
