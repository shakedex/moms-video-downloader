use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Windows CREATE_NO_WINDOW. Every child process uses this so no console flashes.
pub const NO_WINDOW: u32 = 0x0800_0000;

/// `%LOCALAPPDATA%\<exe name>`, e.g. `MomsVideoDownloader`, so a build made under another name
/// keeps its own tools and settings.
pub fn app_dir(app: &AppHandle) -> PathBuf {
    let name = app
        .config()
        .main_binary_name
        .clone()
        .unwrap_or_else(|| app.package_info().crate_name.to_string());
    app.path().local_data_dir().expect("local data dir").join(name)
}

/// Builds from before the rename kept everything in `%LOCALAPPDATA%\LipszycVideoDownloader`.
/// Moving it keeps the downloaded tools and the chosen folder across the update.
pub fn migrate_legacy_dir(app: &AppHandle) {
    let new = app_dir(app);
    let old = new.with_file_name("LipszycVideoDownloader");
    if old.is_dir() && !new.exists() {
        let _ = std::fs::rename(old, new);
    }
}

pub fn bin_dir(app: &AppHandle) -> PathBuf {
    app_dir(app).join("bin")
}

pub fn ytdlp_exe(app: &AppHandle) -> PathBuf {
    bin_dir(app).join("yt-dlp.exe")
}

pub fn ffmpeg_exe(app: &AppHandle) -> PathBuf {
    bin_dir(app).join("ffmpeg.exe")
}

pub fn ffprobe_exe(app: &AppHandle) -> PathBuf {
    bin_dir(app).join("ffprobe.exe")
}
