use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};

use crate::{paths, settings};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    Video,
    Music,
}

#[derive(Debug, Clone)]
pub struct Job {
    pub id: u32,
    pub url: String,
    pub mode: Mode,
}

#[derive(Debug, PartialEq)]
pub enum Parsed {
    Progress { status: String, percent: f32, eta: String },
    Title(String),
    File(String),
}

#[derive(Default)]
pub struct DownloaderState {
    inner: Arc<Mutex<Inner>>,
}

#[derive(Default)]
struct Inner {
    next_id: u32,
    queue: VecDeque<Job>,
    running: Option<Running>,
    worker_active: bool,
}

struct Running {
    job: Job,
    title: Option<String>,
    child: Option<Child>,
    cancelled: bool,
}

pub fn build_args(
    mode: Mode,
    compat: bool,
    bin_dir: &Path,
    download_dir: &Path,
    url: &str,
) -> Vec<String> {
    let mut a: Vec<String> = vec![
        "--no-playlist".into(),
        "--ffmpeg-location".into(),
        bin_dir.to_string_lossy().into(),
        "-P".into(),
        download_dir.to_string_lossy().into(),
        "-o".into(),
        "%(title)s.%(ext)s".into(),
        "--windows-filenames".into(),
        "--newline".into(),
        "--progress".into(),
        "--progress-template".into(),
        "download:MVD|%(progress.status)s|%(progress._percent_str)s|%(progress._eta_str)s".into(),
        "--print".into(),
        "before_dl:MVD_TITLE|%(title)s".into(),
        "--print".into(),
        "after_move:MVD_FILE|%(filepath)s".into(),
        "--no-warnings".into(),
        "--encoding".into(),
        "utf-8".into(),
    ];
    match mode {
        Mode::Video if compat => a.extend([
            "-S".to_string(),
            "res,vcodec:h264,acodec:m4a".to_string(),
            "--merge-output-format".to_string(),
            "mp4".to_string(),
        ]),
        Mode::Video => a.extend([
            "-f".to_string(),
            "bv*+ba/b".to_string(),
            "--merge-output-format".to_string(),
            "mp4".to_string(),
        ]),
        Mode::Music => a.extend([
            "-x".to_string(),
            "--audio-format".to_string(),
            "mp3".to_string(),
            "--audio-quality".to_string(),
            "0".to_string(),
            "--embed-thumbnail".to_string(),
            "--embed-metadata".to_string(),
        ]),
    }
    a.push("--".to_string());
    a.push(url.to_string());
    a
}

pub fn parse_line(line: &str) -> Option<Parsed> {
    let line = line.trim();
    if let Some(rest) = line.strip_prefix("MVD_TITLE|") {
        return Some(Parsed::Title(rest.to_string()));
    }
    if let Some(rest) = line.strip_prefix("MVD_FILE|") {
        return Some(Parsed::File(rest.to_string()));
    }
    let rest = line.strip_prefix("MVD|")?;
    let mut parts = rest.splitn(3, '|');
    let status = parts.next()?.trim().to_string();
    let pct = parts.next()?.trim().trim_end_matches('%').trim();
    let percent = pct.parse::<f32>().unwrap_or(0.0);
    let eta = parts.next().unwrap_or("").trim().to_string();
    Some(Parsed::Progress { status, percent, eta })
}

pub fn classify_error(stderr: &str) -> &'static str {
    let s = stderr.to_ascii_lowercase();
    if s.contains("unsupported url") || s.contains("is not a valid url") {
        "unsupported_url"
    } else if s.contains("no space left") || s.contains("there is not enough space") {
        "disk"
    } else if s.contains("urlopen error")
        || s.contains("getaddrinfo failed")
        || s.contains("unable to download")
        || s.contains("network is unreachable")
        || s.contains("timed out")
    {
        "network"
    } else {
        "yt_dlp_failed"
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TitleEv { id: u32, title: String }
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ProgressEv { id: u32, percent: f32, eta: String, status: String }
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DoneEv { id: u32, path: Option<String> }
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct FailedEv { id: u32, code: String, details: String }
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct IdEv { id: u32 }

fn cleanup_partials(download_dir: &Path, title: Option<&str>) {
    let Some(title) = title else { return };
    let needle: String = title
        .chars()
        .filter(|c| c.is_alphanumeric())
        .take(20)
        .collect::<String>()
        .to_lowercase();
    if needle.is_empty() { return; }
    let Ok(entries) = std::fs::read_dir(download_dir) else { return };
    for e in entries.flatten() {
        let name = e.file_name().to_string_lossy().to_string();
        let lower = name.to_lowercase();
        let is_partial = lower.ends_with(".part") || lower.ends_with(".ytdl");
        let stem: String = lower.chars().filter(|c| c.is_alphanumeric()).collect();
        if is_partial && stem.contains(&needle) {
            let _ = std::fs::remove_file(e.path());
        }
    }
}

async fn run_job(app: AppHandle, inner: Arc<Mutex<Inner>>, job: Job) {
    let s = settings::load(&app);
    let bin = paths::bin_dir(&app);
    let dl = PathBuf::from(&s.download_dir);
    let exe = paths::ytdlp_exe(&app);
    if !exe.exists() {
        let _ = app.emit("job-failed", FailedEv { id: job.id, code: "tool_missing".into(), details: String::new() });
        return;
    }
    let args = build_args(job.mode, s.compat_mode, &bin, &dl, &job.url);
    let child = Command::new(&exe)
        .args(&args)
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUTF8", "1")
        .creation_flags(paths::NO_WINDOW)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null())
        .spawn();
    let mut child = match child {
        Ok(c) => c,
        Err(_) => {
            let _ = app.emit("job-failed", FailedEv { id: job.id, code: "tool_missing".into(), details: String::new() });
            return;
        }
    };
    let stdout = child.stdout.take().expect("stdout");
    let stderr = child.stderr.take().expect("stderr");
    {
        let mut g = inner.lock().unwrap();
        g.running = Some(Running { job: job.clone(), title: None, child: Some(child), cancelled: false });
    }

    let stderr_task = tokio::spawn(async move {
        let mut buf = String::new();
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(l)) = lines.next_line().await {
            buf.push_str(&l);
            buf.push('\n');
        }
        buf
    });

    let mut final_path: Option<String> = None;
    let mut lines = BufReader::new(stdout).lines();
    while let Ok(Some(l)) = lines.next_line().await {
        match parse_line(&l) {
            Some(Parsed::Title(t)) => {
                if let Ok(mut g) = inner.lock() {
                    if let Some(r) = g.running.as_mut() { r.title = Some(t.clone()); }
                }
                let _ = app.emit("job-title", TitleEv { id: job.id, title: t });
            }
            Some(Parsed::File(p)) => final_path = Some(p),
            Some(Parsed::Progress { status, percent, eta }) => {
                let (status, percent) = if status == "finished" {
                    ("processing".to_string(), 100.0)
                } else {
                    ("downloading".to_string(), percent)
                };
                let _ = app.emit("job-progress", ProgressEv { id: job.id, percent, eta, status });
            }
            None => {}
        }
    }

    let stderr_text = stderr_task.await.unwrap_or_default();
    let (mut child_opt, cancelled, title) = {
        let mut g = inner.lock().unwrap();
        let r = g.running.take();
        match r {
            Some(r) => (r.child, r.cancelled, r.title),
            None => (None, false, None),
        }
    };
    let status = match child_opt.as_mut() {
        Some(c) => c.wait().await.ok(),
        None => None,
    };

    if cancelled {
        cleanup_partials(&dl, title.as_deref());
        let _ = app.emit("job-cancelled", IdEv { id: job.id });
        return;
    }
    let ok = status.map(|s| s.success()).unwrap_or(false);
    if ok {
        let _ = app.emit("job-done", DoneEv { id: job.id, path: final_path });
    } else {
        let code = classify_error(&stderr_text).to_string();
        let _ = app.emit("job-failed", FailedEv { id: job.id, code, details: stderr_text });
    }
}

fn start_worker(app: AppHandle, inner: Arc<Mutex<Inner>>) {
    tauri::async_runtime::spawn(async move {
        loop {
            let job = {
                let mut g = inner.lock().unwrap();
                match g.queue.pop_front() {
                    Some(j) => j,
                    None => {
                        g.worker_active = false;
                        return;
                    }
                }
            };
            run_job(app.clone(), inner.clone(), job).await;
        }
    });
}

#[tauri::command]
pub fn enqueue_download(
    app: AppHandle,
    state: State<'_, DownloaderState>,
    url: String,
    mode: Mode,
) -> Result<u32, String> {
    if !paths::ytdlp_exe(&app).exists() {
        return Err("tool_missing".into());
    }
    let url = url.trim().to_string();
    let inner = state.inner.clone();
    let (id, start) = {
        let mut g = inner.lock().unwrap();
        let dup = g.queue.iter().any(|j| j.url == url)
            || g.running.as_ref().map(|r| r.job.url == url).unwrap_or(false);
        if dup {
            return Err("duplicate".into());
        }
        g.next_id += 1;
        let id = g.next_id;
        g.queue.push_back(Job { id, url, mode });
        let start = !g.worker_active;
        g.worker_active = true;
        (id, start)
    };
    if start {
        start_worker(app, inner);
    }
    Ok(id)
}

#[tauri::command]
pub fn cancel_download(app: AppHandle, state: State<'_, DownloaderState>, id: u32) {
    let mut g = state.inner.lock().unwrap();
    if let Some(pos) = g.queue.iter().position(|j| j.id == id) {
        g.queue.remove(pos);
        let _ = app.emit("job-cancelled", IdEv { id });
        return;
    }
    if let Some(r) = g.running.as_mut() {
        if r.job.id == id {
            r.cancelled = true;
            if let Some(c) = r.child.as_mut() {
                let _ = c.start_kill();
            }
        }
    }
}

#[tauri::command]
pub async fn cancel_all(app: AppHandle, state: State<'_, DownloaderState>) -> Result<(), ()> {
    let ids: Vec<u32> = {
        let g = state.inner.lock().unwrap();
        let mut v: Vec<u32> = g.queue.iter().map(|j| j.id).collect();
        if let Some(r) = g.running.as_ref() { v.push(r.job.id); }
        v
    };
    for id in ids {
        cancel_download(app.clone(), state.clone(), id);
    }
    for _ in 0..30 {
        if state.inner.lock().unwrap().running.is_none() {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }
    Ok(())
}

#[tauri::command]
pub fn reveal_in_explorer(path: String, folder: String) {
    use std::os::windows::process::CommandExt;
    let mut cmd = std::process::Command::new("explorer.exe");
    if !path.is_empty() && std::path::Path::new(&path).exists() {
        cmd.raw_arg(format!("/select,\"{path}\""));
    } else {
        cmd.arg(folder);
    }
    let _ = cmd.creation_flags(paths::NO_WINDOW).spawn();
}

#[tauri::command]
pub fn open_folder(path: String) {
    use std::os::windows::process::CommandExt;
    let _ = std::process::Command::new("explorer.exe")
        .arg(path)
        .creation_flags(paths::NO_WINDOW)
        .spawn();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_progress_line() {
        let p = parse_line("MVD|downloading|  42.3%|00:12").unwrap();
        assert_eq!(p, Parsed::Progress { status: "downloading".into(), percent: 42.3, eta: "00:12".into() });
    }

    #[test]
    fn parses_title_and_file_lines() {
        assert_eq!(parse_line("MVD_TITLE|Hello World"), Some(Parsed::Title("Hello World".into())));
        assert_eq!(parse_line("MVD_FILE|C:\\x\\a.mp4"), Some(Parsed::File("C:\\x\\a.mp4".into())));
    }

    #[test]
    fn ignores_other_lines() {
        assert_eq!(parse_line("[youtube] Extracting URL"), None);
        assert_eq!(parse_line(""), None);
    }

    #[test]
    fn video_args_use_best_and_mp4() {
        let a = build_args(Mode::Video, false, Path::new("C:\\bin"), Path::new("C:\\dl"), "https://x");
        assert!(a.windows(2).any(|w| w == ["-f", "bv*+ba/b"]));
        assert!(a.contains(&"--no-playlist".to_string()));
        assert!(a.contains(&"--progress".to_string()));
        assert_eq!(a.last().unwrap(), "https://x");
        assert_eq!(a[a.len() - 2], "--".to_string());
    }

    #[test]
    fn compat_args_prefer_h264() {
        let a = build_args(Mode::Video, true, Path::new("C:\\bin"), Path::new("C:\\dl"), "https://x");
        assert!(a.windows(2).any(|w| w == ["-S", "res,vcodec:h264,acodec:m4a"]));
        assert!(!a.contains(&"-f".to_string()));
    }

    #[test]
    fn music_args_extract_mp3() {
        let a = build_args(Mode::Music, false, Path::new("C:\\bin"), Path::new("C:\\dl"), "https://x");
        assert!(a.contains(&"-x".to_string()));
        assert!(a.windows(2).any(|w| w == ["--audio-format", "mp3"]));
    }

    #[test]
    fn classifies_errors() {
        assert_eq!(classify_error("ERROR: Unsupported URL: https://x"), "unsupported_url");
        assert_eq!(classify_error("urlopen error [Errno 11001] getaddrinfo failed"), "network");
        assert_eq!(classify_error("something odd"), "yt_dlp_failed");
    }
}
