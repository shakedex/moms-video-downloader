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
    let context = moms_video_downloader_lib::context();
    if !webview2_present() {
        let strings = serde_json::from_str::<serde_json::Value>(STRINGS).ok();
        let string = |key: &str| strings.as_ref()?.get(key)?.as_str().map(String::from);
        let msg = string("webview2_missing").unwrap_or_else(|| "WebView2 runtime is missing.".to_string());
        let title = context.config().product_name.clone().or_else(|| string("app_title")).unwrap_or_default();
        rfd::MessageDialog::new()
            .set_title(title)
            .set_description(msg)
            .set_level(rfd::MessageLevel::Error)
            .show();
        return;
    }
    moms_video_downloader_lib::run(context);
}
