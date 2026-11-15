use crate::models::{DownloadManagerSnapshot, DownloadSettings, EnqueueDownloadInput};
use crate::repo_client::download_manager;
use tauri::AppHandle;

#[tauri::command]
pub async fn get_download_manager_state() -> Result<DownloadManagerSnapshot, String> {
    download_manager::get_download_manager_state().await
}

#[tauri::command]
pub async fn enqueue_downloads(
    app: AppHandle,
    items: Vec<EnqueueDownloadInput>,
) -> Result<DownloadManagerSnapshot, String> {
    download_manager::enqueue_downloads(app, items).await
}

#[tauri::command]
pub async fn pause_download(
    app: AppHandle,
    task_id: String,
) -> Result<DownloadManagerSnapshot, String> {
    download_manager::pause_download(app, task_id).await
}

#[tauri::command]
pub async fn pause_all_downloads(app: AppHandle) -> Result<DownloadManagerSnapshot, String> {
    download_manager::pause_all_downloads(app).await
}

#[tauri::command]
pub async fn resume_download(
    app: AppHandle,
    task_id: String,
) -> Result<DownloadManagerSnapshot, String> {
    download_manager::resume_download(app, task_id).await
}

#[tauri::command]
pub async fn resume_all_downloads(app: AppHandle) -> Result<DownloadManagerSnapshot, String> {
    download_manager::resume_all_downloads(app).await
}

#[tauri::command]
pub async fn prioritize_download(
    app: AppHandle,
    task_id: String,
) -> Result<DownloadManagerSnapshot, String> {
    download_manager::prioritize_download(app, task_id).await
}

#[tauri::command]
pub async fn retry_download(
    app: AppHandle,
    task_id: String,
) -> Result<DownloadManagerSnapshot, String> {
    download_manager::retry_download(app, task_id).await
}

#[tauri::command]
pub async fn retry_all_failed_downloads(
    app: AppHandle,
) -> Result<DownloadManagerSnapshot, String> {
    download_manager::retry_all_failed_downloads(app).await
}

#[tauri::command]
pub async fn cancel_all_downloads(app: AppHandle) -> Result<DownloadManagerSnapshot, String> {
    download_manager::cancel_all_downloads(app).await
}

#[tauri::command]
pub async fn update_download_settings(
    app: AppHandle,
    settings: DownloadSettings,
) -> Result<DownloadManagerSnapshot, String> {
    download_manager::update_download_settings(app, settings).await
}

#[tauri::command]
pub async fn clear_download_history(app: AppHandle) -> Result<DownloadManagerSnapshot, String> {
    download_manager::clear_download_history(app).await
}

#[tauri::command]
pub async fn cancel_download(app: AppHandle, task_id: String) -> Result<(), String> {
    download_manager::legacy_cancel_download(app, task_id).await
}
