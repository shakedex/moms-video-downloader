use futures_util::StreamExt;
use serde::Serialize;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};

use crate::paths;

const YTDLP_URL: &str =
    "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe";
const FFMPEG_URL: &str =
    "https://github.com/yt-dlp/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip";

#[derive(Serialize, Clone)]
struct SetupProgress<'a> {
    step: &'a str,
    downloaded: u64,
    total: u64,
}

pub fn all_present(app: &AppHandle) -> bool {
    paths::ytdlp_exe(app).exists()
        && paths::ffmpeg_exe(app).exists()
        && paths::ffprobe_exe(app).exists()
}

async fn download_to(
    app: &AppHandle,
    step: &str,
    url: &str,
    dest: &Path,
) -> Result<(), String> {
    let part = dest.with_extension("part");
    let _ = fs::remove_file(&part);
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|_| "disk".to_string())?;
    }
    let resp = reqwest::Client::new()
        .get(url)
        .send()
        .await
        .map_err(|_| "network".to_string())?;
    if !resp.status().is_success() {
        return Err("network".into());
    }
    let total = resp.content_length().unwrap_or(0);
    let mut file = fs::File::create(&part).map_err(|_| "disk".to_string())?;
    let mut stream = resp.bytes_stream();
    let mut downloaded: u64 = 0;
    let mut last_emit: u64 = 0;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| "network".to_string())?;
        file.write_all(&chunk).map_err(|_| "disk".to_string())?;
        downloaded += chunk.len() as u64;
        if downloaded - last_emit > 256 * 1024 {
            last_emit = downloaded;
            let _ = app.emit("setup-progress", SetupProgress { step, downloaded, total });
        }
    }
    drop(file);
    let _ = app.emit("setup-progress", SetupProgress { step, downloaded, total });
    fs::rename(&part, dest).map_err(|_| "disk".to_string())
}

fn extract_ffmpeg(zip_path: &Path, bin: &Path) -> Result<(), String> {
    let file = fs::File::open(zip_path).map_err(|_| "disk".to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|_| "disk".to_string())?;
    let mut found = 0;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|_| "disk".to_string())?;
        let name = entry.name().replace('\\', "/");
        let target = if name.ends_with("/bin/ffmpeg.exe") {
            "ffmpeg.exe"
        } else if name.ends_with("/bin/ffprobe.exe") {
            "ffprobe.exe"
        } else {
            continue;
        };
        let mut buf = Vec::new();
        entry.read_to_end(&mut buf).map_err(|_| "disk".to_string())?;
        fs::write(bin.join(target), buf).map_err(|_| "disk".to_string())?;
        found += 1;
    }
    if found == 2 { Ok(()) } else { Err("network".into()) }
}

async fn install(app: &AppHandle) -> Result<(), String> {
    let bin = paths::bin_dir(app);
    fs::create_dir_all(&bin).map_err(|_| "disk".to_string())?;
    if !paths::ytdlp_exe(app).exists() {
        download_to(app, "ytdlp", YTDLP_URL, &paths::ytdlp_exe(app)).await?;
    }
    if !paths::ffmpeg_exe(app).exists() || !paths::ffprobe_exe(app).exists() {
        let zip_path = bin.join("ffmpeg.zip");
        download_to(app, "ffmpeg", FFMPEG_URL, &zip_path).await?;
        let bin2 = bin.clone();
        let zp = zip_path.clone();
        tauri::async_runtime::spawn_blocking(move || extract_ffmpeg(&zp, &bin2))
            .await
            .map_err(|_| "disk".to_string())??;
        let _ = fs::remove_file(zip_path);
    }
    Ok(())
}

fn run_ytdlp(exe: PathBuf, args: &[&str]) -> Result<String, String> {
    use std::os::windows::process::CommandExt;
    if !exe.exists() {
        return Err("tool_missing".into());
    }
    let out = std::process::Command::new(exe)
        .args(args)
        .creation_flags(paths::NO_WINDOW)
        .output()
        .map_err(|_| "tool_missing".to_string())?;
    let text = String::from_utf8_lossy(&out.stdout).to_string()
        + &String::from_utf8_lossy(&out.stderr);
    Ok(text.trim().to_string())
}

/// Fire-and-forget `yt-dlp -U` on startup. Output goes to update.log.
pub fn spawn_background_update(app: &AppHandle) {
    let exe = paths::ytdlp_exe(app);
    let log = paths::app_dir(app).join("update.log");
    std::thread::spawn(move || {
        let result = run_ytdlp(exe, &["-U"]);
        let line = match result {
            Ok(t) => t,
            Err(e) => format!("error: {e}"),
        };
        let _ = fs::write(log, line);
    });
}

#[tauri::command]
pub fn tools_status(app: AppHandle) -> bool {
    all_present(&app)
}

#[tauri::command]
pub async fn install_tools(app: AppHandle) -> Result<(), String> {
    install(&app).await
}

#[tauri::command]
pub async fn reinstall_tools(app: AppHandle) -> Result<(), String> {
    let _ = fs::remove_dir_all(paths::bin_dir(&app));
    install(&app).await
}

#[tauri::command]
pub async fn ytdlp_version(app: AppHandle) -> Result<String, String> {
    let exe = paths::ytdlp_exe(&app);
    tauri::async_runtime::spawn_blocking(move || run_ytdlp(exe, &["--version"]))
        .await
        .map_err(|_| "tool_missing".to_string())?
}

#[tauri::command]
pub async fn update_ytdlp(app: AppHandle) -> Result<String, String> {
    let exe = paths::ytdlp_exe(&app);
    let text = tauri::async_runtime::spawn_blocking(move || run_ytdlp(exe, &["-U"]))
        .await
        .map_err(|_| "tool_missing".to_string())??;
    Ok(text.lines().last().unwrap_or("").to_string())
}
