mod paths;
mod settings;
mod tools;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if tools::all_present(&app.handle()) {
                tools::spawn_background_update(&app.handle());
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            settings::get_settings,
            settings::set_settings,
            tools::tools_status,
            tools::install_tools,
            tools::reinstall_tools,
            tools::ytdlp_version,
            tools::update_ytdlp,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
