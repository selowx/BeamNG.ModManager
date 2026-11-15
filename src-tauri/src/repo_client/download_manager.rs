use super::download_throttle::DownloadRateLimiter;
use super::downloader::{run_download, DownloadOutcome, DownloadProgressUpdate, TransferSignal};
use crate::beamng_env::{detect_beamng_config, load_manager_state, save_manager_state};
use crate::models::{DownloadHistoryEntry, DownloadManagerSnapshot, DownloadSettings, DownloadTaskRecord, EnqueueDownloadInput, ManagerStateFile};
use std::{collections::{HashMap, HashSet}, fs, path::PathBuf, sync::{Arc, Mutex, OnceLock}, time::{Duration, Instant, SystemTime, UNIX_EPOCH}};
use tauri::{AppHandle, Emitter};
use tokio::sync::watch;

const MAX_HISTORY: usize = 50;
fn unix_now() -> u64 { SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0) }
fn is_active(s: &str) -> bool { matches!(s, "queued" | "downloading" | "resolving" | "verifying" | "paused") }
fn clamp_settings(mut s: DownloadSettings) -> DownloadSettings {
    s.max_concurrent = s.max_concurrent.clamp(1, 3);
    s.post_download_mode = if s.post_download_mode.eq_ignore_ascii_case("disabled") { "disabled" } else { "enabled" }.into();
    s
}

struct ManagerInner {
    tasks: Vec<DownloadTaskRecord>, history: Vec<DownloadHistoryEntry>, settings: DownloadSettings,
    active_signals: HashMap<String, watch::Sender<TransferSignal>>,
    last_emit: Instant, next_priority: i64, task_seq: u64,
}
impl ManagerInner {
    fn snapshot(&self) -> DownloadManagerSnapshot { DownloadManagerSnapshot { tasks: self.tasks.clone(), history: self.history.clone(), settings: self.settings.clone() } }
    fn sort_tasks(&mut self) { self.tasks.sort_by(|a, b| b.priority.cmp(&a.priority)); }
}

pub struct DownloadManagerEngine { user_path: Option<String>, inner: Mutex<ManagerInner>, state_io_lock: Mutex<()>, rate_limiter: Arc<DownloadRateLimiter> }
static DOWNLOAD_MANAGER: OnceLock<Arc<DownloadManagerEngine>> = OnceLock::new();
pub fn global_manager() -> Arc<DownloadManagerEngine> {
    DOWNLOAD_MANAGER.get_or_init(|| {
        let up = detect_beamng_config().ok().map(|c| c.user_path);
        let st = up.as_deref().map(load_manager_state).unwrap_or_default();
        Arc::new(DownloadManagerEngine::from_state(up, st))
    }).clone()
}

impl DownloadManagerEngine {
    fn from_state(user_path: Option<String>, mut state: ManagerStateFile) -> Self {
        let settings = clamp_settings(state.download_settings);
        for t in &mut state.download_queue {
            if matches!(t.status.as_str(), "downloading" | "resolving" | "verifying") {
                t.status = "paused".into(); t.speed_bps = 0; t.eta_seconds = None; t.message = Some("Paused (app restarted)".into());
            }
        }
        state.download_history.truncate(MAX_HISTORY);
        let next_priority = state.download_queue.iter().map(|t| t.priority).max().unwrap_or(0).saturating_add(1);
        let rate_limiter = Arc::new(DownloadRateLimiter::new(settings.speed_limit_bps));
        let mut inner = ManagerInner {
            tasks: state.download_queue, history: state.download_history, settings, active_signals: HashMap::new(),
            last_emit: Instant::now() - Duration::from_secs(1), next_priority, task_seq: 1,
        };
        inner.sort_tasks();
        Self { user_path, inner: Mutex::new(inner), state_io_lock: Mutex::new(()), rate_limiter }
    }
    fn lock_inner(&self) -> std::sync::MutexGuard<'_, ManagerInner> { match self.inner.lock() { Ok(g) => g, Err(p) => p.into_inner() } }
    fn persist_and_emit(&self, app: Option<&AppHandle>, snap: &DownloadManagerSnapshot) {
        if let Some(ref up) = self.user_path {
            let _io = match self.state_io_lock.lock() { Ok(g) => g, Err(p) => p.into_inner() };
            let mut st = load_manager_state(up);
            st.download_queue = snap.tasks.clone(); st.download_history = snap.history.clone(); st.download_settings = snap.settings.clone();
            let _ = save_manager_state(up, &st);
        }
        if let Some(a) = app { let _ = a.emit("download-manager-updated", snap); }
    }
    fn enqueue_in_memory(&self, items: Vec<EnqueueDownloadInput>) -> (DownloadManagerSnapshot, Vec<String>) {
        let mut inner = self.lock_inner();
        let mut seen: HashSet<u64> = inner.tasks.iter().filter(|t| t.resource_id > 0 && is_active(&t.status)).map(|t| t.resource_id).collect();
        let mut ids = Vec::new();
        for item in items {
            if item.resource_id > 0 && !seen.insert(item.resource_id) {
                if let Some(ex) = inner.tasks.iter().find(|t| t.resource_id == item.resource_id && is_active(&t.status)) { ids.push(ex.task_id.clone()); }
                continue;
            }
            if item.resource_id > 0 { inner.tasks.retain(|t| !(t.resource_id == item.resource_id && !is_active(&t.status))); }
            let seq = inner.task_seq; inner.task_seq += 1;
            let tid = if item.resource_id > 0 { format!("dl-{}", item.resource_id) } else { format!("dl-local-{}", seq) };
            inner.tasks.push(DownloadTaskRecord { task_id: tid.clone(), resource_id: item.resource_id, slug: item.slug, title: item.title, status: "queued".into(), message: Some("Queued".into()), created_at: unix_now(), ..Default::default() });
            ids.push(tid);
        }
        inner.sort_tasks(); (inner.snapshot(), ids)
    }
    fn pause_in_memory(&self, task_id: Option<&str>) -> DownloadManagerSnapshot {
        let mut inner = self.lock_inner();
        let mut sigs = Vec::new();
        for t in &mut inner.tasks {
            if task_id.is_none_or(|id| id == t.task_id) && is_active(&t.status) && t.status != "paused" {
                t.status = "paused".into(); t.speed_bps = 0; t.eta_seconds = None; t.message = Some("Paused".into()); sigs.push(t.task_id.clone());
            }
        }
        for id in sigs { if let Some(tx) = inner.active_signals.get(&id) { let _ = tx.send(TransferSignal::Paused); } }
        inner.snapshot()
    }
    fn requeue_in_memory(&self, task_id: Option<&str>, failed_only: bool) -> DownloadManagerSnapshot {
        let mut inner = self.lock_inner();
        for t in &mut inner.tasks {
            let match_st = if failed_only { matches!(t.status.as_str(), "error" | "failed") } else { t.status == "paused" };
            if task_id.is_none_or(|id| id == t.task_id) && match_st {
                if failed_only && !t.part_path.as_deref().is_some_and(|p| PathBuf::from(p).exists()) { t.part_path = None; t.downloaded_bytes = 0; }
                t.status = "queued".into(); t.speed_bps = 0; t.eta_seconds = None; t.message = Some(if failed_only { "Queued for retry" } else { "Queued" }.into());
            }
        }
        inner.sort_tasks(); inner.snapshot()
    }
    fn prioritize_in_memory(&self, task_id: &str) -> DownloadManagerSnapshot {
        let mut inner = self.lock_inner(); let p = inner.next_priority;
        if let Some(t) = inner.tasks.iter_mut().find(|t| t.task_id == task_id) { t.priority = p; inner.next_priority += 1; }
        inner.sort_tasks(); inner.snapshot()
    }
    fn cancel_in_memory(&self, task_id: Option<&str>) -> DownloadManagerSnapshot {
        let mut inner = self.lock_inner(); let mut removed = Vec::new();
        inner.tasks.retain(|t| if task_id.is_none_or(|id| id == t.task_id) { removed.push((t.task_id.clone(), t.part_path.clone())); false } else { true });
        for (id, part) in removed {
            if let Some(tx) = inner.active_signals.get(&id) { let _ = tx.send(TransferSignal::Cancelled); } else if let Some(p) = part { let _ = fs::remove_file(p); }
        }
        inner.snapshot()
    }
    fn update_settings_in_memory(&self, settings: DownloadSettings) -> DownloadManagerSnapshot {
        let clean = clamp_settings(settings); self.rate_limiter.set_limit_bps(clean.speed_limit_bps);
        let mut inner = self.lock_inner(); inner.settings = clean; inner.snapshot()
    }
}

fn pump_queue(engine: &Arc<DownloadManagerEngine>, app: &AppHandle) {
    let mut to_spawn = Vec::new();
    let snap = {
        let mut inner = engine.lock_inner();
        let slots = (inner.settings.max_concurrent.clamp(1, 3) as usize).saturating_sub(inner.active_signals.len());
        if slots == 0 { return; }
        let (post_mode, add_profile) = (inner.settings.post_download_mode.clone(), inner.settings.add_to_active_profile);
        let qids: Vec<String> = inner.tasks.iter().filter(|t| t.status == "queued" && !inner.active_signals.contains_key(&t.task_id))
            .take(slots).map(|t| t.task_id.clone()).collect();
        for qid in qids {
            let (tx, rx) = watch::channel(TransferSignal::Running);
            if let Some(t) = inner.tasks.iter_mut().find(|t| t.task_id == qid) {
                t.status = "resolving".into(); t.message = Some("Starting download...".into());
                to_spawn.push((t.clone(), post_mode.clone(), add_profile, rx));
                inner.active_signals.insert(qid, tx);
            }
        }
        if to_spawn.is_empty() { return; }
        inner.snapshot()
    };
    engine.persist_and_emit(Some(app), &snap);
    for (task, post_mode, add_profile, rx) in to_spawn {
        let (eng, app_c) = (engine.clone(), app.clone());
        tokio::spawn(async move { run_task_worker(eng, app_c, task, post_mode, add_profile, rx).await; });
    }
}

async fn run_task_worker(
    engine: Arc<DownloadManagerEngine>, app: AppHandle, task: DownloadTaskRecord,
    post_mode: String, add_profile: bool, rx: watch::Receiver<TransferSignal>,
) {
    let (tid, eng_p, app_p, tid_p) = (task.task_id.clone(), engine.clone(), app.clone(), task.task_id.clone());
    let res = run_download(
        &app, &tid, task.resource_id, &task.slug, &task.title, task.part_path.clone().map(PathBuf::from),
        (!task.filename.is_empty()).then_some(task.filename.clone()), task.total_bytes, &post_mode, add_profile, engine.rate_limiter.clone(), rx,
        move |u: DownloadProgressUpdate| {
            let mut inner = eng_p.lock_inner();
            let mut changed = false;
            if let Some(t) = inner.tasks.iter_mut().find(|t| t.task_id == tid_p) {
                if !u.filename.is_empty() { t.filename = u.filename; }
                t.downloaded_bytes = u.downloaded_bytes; t.total_bytes = u.total_bytes; t.speed_bps = u.speed_bps;
                t.eta_seconds = (u.speed_bps > 0 && u.total_bytes > u.downloaded_bytes).then(|| (u.total_bytes - u.downloaded_bytes) / u.speed_bps);
                if u.part_path.is_some() { t.part_path = u.part_path; }
                if t.status != "paused" { changed = t.status != u.status; t.status = u.status; t.message = u.message; }
            }
            if changed || inner.last_emit.elapsed() >= Duration::from_millis(200) {
                inner.last_emit = Instant::now(); let s = inner.snapshot(); drop(inner); let _ = app_p.emit("download-manager-updated", &s);
            }
        },
    ).await;
    let snap = {
        let mut inner = engine.lock_inner(); inner.active_signals.remove(&tid);
        match res {
            Ok(DownloadOutcome::Completed(out)) => {
                inner.tasks.retain(|t| t.task_id != tid);
                inner.history.insert(0, DownloadHistoryEntry { task_id: tid.clone(), resource_id: task.resource_id, slug: task.slug, title: task.title, filename: out.final_filename.clone(), size_bytes: out.size_bytes, status: out.status, completed_at: unix_now(), local_mod_id: Some(out.local_mod_id) });
                inner.history.truncate(MAX_HISTORY);
            }
            Ok(DownloadOutcome::Paused { downloaded_bytes, total_bytes, part_path, filename }) => {
                if let Some(t) = inner.tasks.iter_mut().find(|t| t.task_id == tid) {
                    if !filename.is_empty() { t.filename = filename; }
                    t.downloaded_bytes = downloaded_bytes; t.total_bytes = total_bytes; t.speed_bps = 0; t.eta_seconds = None;
                    t.status = "paused".into(); t.message = Some("Paused".into()); t.part_path = part_path.map(|p| p.to_string_lossy().into());
                } else if let Some(pp) = part_path { let _ = fs::remove_file(pp); }
            }
            Ok(DownloadOutcome::Cancelled) => { inner.tasks.retain(|t| t.task_id != tid); }
            Err(err) => {
                if let Some(t) = inner.tasks.iter_mut().find(|t| t.task_id == tid) { t.status = "error".into(); t.speed_bps = 0; t.eta_seconds = None; t.message = Some(err); }
            }
        }
        inner.snapshot()
    };
    engine.persist_and_emit(Some(&app), &snap); pump_queue(&engine, &app);
}

fn apply_action(app: &AppHandle, pump: bool, op: impl FnOnce(&DownloadManagerEngine) -> DownloadManagerSnapshot) -> DownloadManagerSnapshot {
    let eng = global_manager(); let snap = op(&eng); eng.persist_and_emit(Some(app), &snap);
    if pump { pump_queue(&eng, app); return eng.lock_inner().snapshot(); }
    snap
}
pub async fn get_download_manager_state() -> Result<DownloadManagerSnapshot, String> { Ok(global_manager().lock_inner().snapshot()) }
pub async fn enqueue_downloads(app: AppHandle, items: Vec<EnqueueDownloadInput>) -> Result<DownloadManagerSnapshot, String> { Ok(apply_action(&app, true, |e| e.enqueue_in_memory(items).0)) }
pub async fn pause_download(app: AppHandle, task_id: String) -> Result<DownloadManagerSnapshot, String> { Ok(apply_action(&app, false, |e| e.pause_in_memory(Some(&task_id)))) }
pub async fn pause_all_downloads(app: AppHandle) -> Result<DownloadManagerSnapshot, String> { Ok(apply_action(&app, false, |e| e.pause_in_memory(None))) }
pub async fn resume_download(app: AppHandle, task_id: String) -> Result<DownloadManagerSnapshot, String> { Ok(apply_action(&app, true, |e| e.requeue_in_memory(Some(&task_id), false))) }
pub async fn resume_all_downloads(app: AppHandle) -> Result<DownloadManagerSnapshot, String> { Ok(apply_action(&app, true, |e| e.requeue_in_memory(None, false))) }
pub async fn prioritize_download(app: AppHandle, task_id: String) -> Result<DownloadManagerSnapshot, String> { Ok(apply_action(&app, true, |e| e.prioritize_in_memory(&task_id))) }
pub async fn retry_download(app: AppHandle, task_id: String) -> Result<DownloadManagerSnapshot, String> { Ok(apply_action(&app, true, |e| e.requeue_in_memory(Some(&task_id), true))) }
pub async fn retry_all_failed_downloads(app: AppHandle) -> Result<DownloadManagerSnapshot, String> { Ok(apply_action(&app, true, |e| e.requeue_in_memory(None, true))) }
pub async fn cancel_download_task(app: AppHandle, task_id: String) -> Result<DownloadManagerSnapshot, String> { Ok(apply_action(&app, true, |e| e.cancel_in_memory(Some(&task_id)))) }
pub async fn cancel_all_downloads(app: AppHandle) -> Result<DownloadManagerSnapshot, String> { Ok(apply_action(&app, false, |e| e.cancel_in_memory(None))) }
pub async fn update_download_settings(app: AppHandle, settings: DownloadSettings) -> Result<DownloadManagerSnapshot, String> { Ok(apply_action(&app, true, |e| e.update_settings_in_memory(settings))) }
pub async fn clear_download_history(app: AppHandle) -> Result<DownloadManagerSnapshot, String> { Ok(apply_action(&app, false, |e| { let mut i = e.lock_inner(); i.history.clear(); i.snapshot() })) }
pub async fn legacy_cancel_download(app: AppHandle, task_id: String) -> Result<(), String> { cancel_download_task(app, task_id).await.map(|_| ()) }

#[cfg(test)]
mod tests {
    use super::*;
    fn test_eng() -> DownloadManagerEngine { DownloadManagerEngine::from_state(None, ManagerStateFile::default()) }
    fn item(id: u64) -> EnqueueDownloadInput { EnqueueDownloadInput { resource_id: id, slug: format!("resources/{}/", id), title: format!("Mod {}", id) } }
    fn ids(s: &DownloadManagerSnapshot) -> Vec<&str> { s.tasks.iter().map(|t| t.task_id.as_str()).collect() }
    #[test]
    fn queue_ordering_and_prioritize() {
        let eng = test_eng();
        assert_eq!(ids(&eng.enqueue_in_memory(vec![item(1), item(2), item(3)]).0), vec!["dl-1", "dl-2", "dl-3"]);
        assert_eq!(ids(&eng.prioritize_in_memory("dl-3")), vec!["dl-3", "dl-1", "dl-2"]);
        assert_eq!(ids(&eng.prioritize_in_memory("dl-2")), vec!["dl-2", "dl-3", "dl-1"]);
    }
    #[test]
    fn enqueue_dedupes_active_paused_queued() {
        let eng = test_eng();
        assert_eq!(eng.enqueue_in_memory(vec![item(42), item(42)]).0.tasks.len(), 1);
        assert_eq!(eng.enqueue_in_memory(vec![item(42)]).0.tasks.len(), 1);
        eng.pause_in_memory(Some("dl-42"));
        assert_eq!(eng.enqueue_in_memory(vec![item(42)]).0.tasks.len(), 1);
        eng.lock_inner().tasks[0].status = "downloading".into();
        assert_eq!(eng.enqueue_in_memory(vec![item(42)]).0.tasks.len(), 1);
        eng.lock_inner().tasks[0].status = "error".into();
        let (s2, _) = eng.enqueue_in_memory(vec![item(42)]);
        assert_eq!((s2.tasks.len(), s2.tasks[0].status.as_str()), (1, "queued"));
    }
    #[test]
    fn max_concurrent_is_clamped() {
        let eng = test_eng();
        assert_eq!(eng.update_settings_in_memory(DownloadSettings { max_concurrent: 0, ..Default::default() }).settings.max_concurrent, 1);
        assert_eq!(eng.update_settings_in_memory(DownloadSettings { max_concurrent: 99, ..Default::default() }).settings.max_concurrent, 3);
        let mut st = ManagerStateFile::default(); st.download_settings.max_concurrent = 12;
        st.download_queue.push(DownloadTaskRecord { task_id: "dl-7".into(), status: "downloading".into(), ..Default::default() });
        let restored = DownloadManagerEngine::from_state(None, st).lock_inner().snapshot();
        assert_eq!((restored.settings.max_concurrent, restored.tasks[0].status.as_str()), (3, "paused"));
    }
    #[test]
    fn cancel_removes_part_file() {
        let eng = test_eng();
        let tmp = std::env::temp_dir().join(format!("mm_dl_test_{}", unix_now()));
        let _ = fs::create_dir_all(&tmp);
        let part = tmp.join("test_mod.zip.part");
        fs::write(&part, b"partial").expect("write part");
        eng.enqueue_in_memory(vec![item(99)]);
        eng.lock_inner().tasks[0].part_path = Some(part.to_string_lossy().into());
        assert!(eng.cancel_in_memory(Some("dl-99")).tasks.is_empty());
        assert!(!part.exists());
        let _ = fs::remove_dir_all(&tmp);
    }
}
