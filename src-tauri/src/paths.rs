use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Windows CREATE_NO_WINDOW. Every child process uses this so no console flashes.
pub const NO_WINDOW: u32 = 0x0800_0000;

pub fn app_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .local_data_dir()
        .expect("local data dir")
        .join("LipszycVideoDownloader")
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
