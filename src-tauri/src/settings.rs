use serde::{Deserialize, Serialize};
use std::fs;
use tauri::{AppHandle, Manager};

use crate::paths;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub download_dir: String,
    pub compat_mode: bool,
}

fn defaults(app: &AppHandle) -> Settings {
    let download_dir = app
        .path()
        .download_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| "C:\\".to_string());
    Settings {
        download_dir,
        compat_mode: false,
    }
}

fn file(app: &AppHandle) -> std::path::PathBuf {
    paths::app_dir(app).join("settings.json")
}

pub fn load(app: &AppHandle) -> Settings {
    let d = defaults(app);
    let Ok(text) = fs::read_to_string(file(app)) else {
        return d;
    };
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Partial {
        download_dir: Option<String>,
        compat_mode: Option<bool>,
    }
    match serde_json::from_str::<Partial>(&text) {
        Ok(p) => Settings {
            download_dir: p.download_dir.unwrap_or(d.download_dir),
            compat_mode: p.compat_mode.unwrap_or(d.compat_mode),
        },
        Err(_) => d,
    }
}

pub fn save(app: &AppHandle, s: &Settings) -> Result<(), String> {
    let path = file(app);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(s).map_err(|e| e.to_string())?;
    fs::write(path, text).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> Settings {
    load(&app)
}

#[tauri::command]
pub fn set_settings(app: AppHandle, settings: Settings) -> Result<(), String> {
    save(&app, &settings)
}
