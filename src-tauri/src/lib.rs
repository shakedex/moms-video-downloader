mod clipboard;
mod downloader;
mod paths;
mod process_tree;
mod settings;
mod tools;

use tauri::Manager;

/// Built separately from `run` so `main.rs` can read the product name before the WebView2 check.
pub fn context() -> tauri::Context<tauri::Wry> {
    tauri::generate_context!()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run(context: tauri::Context<tauri::Wry>) {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .manage(downloader::DownloaderState::default())
        .setup(|app| {
            paths::migrate_legacy_dir(&app.handle());
            // The product name can be overridden per build (scripts/release.ps1 -Name).
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_title(&app.package_info().name);
            }
            if tools::all_present(&app.handle()) {
                tools::spawn_background_update(&app.handle());
            }
            clipboard::start_watcher(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            clipboard::read_clipboard,
            settings::get_settings,
            settings::set_settings,
            tools::tools_status,
            tools::install_tools,
            tools::reinstall_tools,
            tools::ytdlp_version,
            tools::update_ytdlp,
            downloader::enqueue_download,
            downloader::cancel_download,
            downloader::cancel_all,
            downloader::reveal_in_explorer,
            downloader::open_folder,
        ])
        .run(context)
        .expect("error while running tauri application");
}
