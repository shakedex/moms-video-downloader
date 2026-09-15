use serde::Serialize;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

#[derive(Serialize, Clone)]
struct UrlEv { url: String }

pub fn is_url(text: &str) -> bool {
    let t = text.trim();
    (t.starts_with("http://") || t.starts_with("https://"))
        && !t.chars().any(char::is_whitespace)
        && t.len() > 10
}

pub fn start_watcher(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last: Option<String> = None;
        let mut cb = match arboard::Clipboard::new() {
            Ok(c) => c,
            Err(_) => return,
        };
        loop {
            std::thread::sleep(Duration::from_millis(800));
            let Ok(text) = cb.get_text() else { continue };
            let text = text.trim().to_string();
            if last.as_deref() == Some(text.as_str()) {
                continue;
            }
            last = Some(text.clone());
            if is_url(&text) {
                let _ = app.emit("clipboard-url", UrlEv { url: text });
            }
        }
    });
}

#[tauri::command]
pub fn read_clipboard() -> Option<String> {
    let mut cb = arboard::Clipboard::new().ok()?;
    let text = cb.get_text().ok()?;
    let text = text.trim().to_string();
    if is_url(&text) { Some(text) } else { None }
}

#[cfg(test)]
mod tests {
    use super::is_url;

    #[test]
    fn accepts_http_and_https() {
        assert!(is_url("https://www.youtube.com/watch?v=abc"));
        assert!(is_url("  http://example.com/video  "));
    }

    #[test]
    fn rejects_non_urls() {
        assert!(!is_url("hello world"));
        assert!(!is_url("https://a b"));
        assert!(!is_url("ftp://x.com/y"));
        assert!(!is_url(""));
    }
}
