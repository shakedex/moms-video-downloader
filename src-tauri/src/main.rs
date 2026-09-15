#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

const STRINGS: &str = include_str!("../../src/strings/he.json");

fn webview2_present() -> bool {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;
    const CLIENT: &str = r"SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
    const CLIENT_32: &str = r"SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
    let has = |root: winreg::HKEY, path: &str| {
        RegKey::predef(root)
            .open_subkey(path)
            .and_then(|k| k.get_value::<String, _>("pv"))
            .map(|v| !v.is_empty() && v != "0.0.0.0")
            .unwrap_or(false)
    };
    has(HKEY_LOCAL_MACHINE, CLIENT)
        || has(HKEY_LOCAL_MACHINE, CLIENT_32)
        || has(HKEY_CURRENT_USER, CLIENT)
        || has(HKEY_CURRENT_USER, CLIENT_32)
}

fn main() {
    if !webview2_present() {
        let msg = serde_json::from_str::<serde_json::Value>(STRINGS)
            .ok()
            .and_then(|v| v.get("webview2_missing")?.as_str().map(String::from))
            .unwrap_or_else(|| "WebView2 runtime is missing.".to_string());
        rfd::MessageDialog::new()
            .set_title("Lipszyc Video Downloader")
            .set_description(msg)
            .set_level(rfd::MessageLevel::Error)
            .show();
        return;
    }
    tauri_app_lib::run();
}
