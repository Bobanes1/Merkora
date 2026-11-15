//! Merkora app (desktop and Android): Rust core (save file, media, Anki import, AI requests) with the Merkora interface in its window.

mod anki;
mod export;
mod server;
mod storage;

use base64::Engine;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

// ---------- save file ----------
#[tauri::command]
fn load_data() -> Option<String> {
    storage::load()
}

#[tauri::command]
async fn save_data(json: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || storage::save(&json)).await.map_err(|e| e.to_string())?
}

/// Used when the window closes: must finish before the app quits.
#[tauri::command]
fn save_data_now(json: String) -> Result<(), String> {
    storage::save(&json)
}

#[tauri::command]
fn data_folder() -> String {
    storage::data_dir().to_string_lossy().into_owned()
}

#[tauri::command]
fn open_data_folder() {
    let dir = storage::data_dir();
    let _ = std::fs::create_dir_all(&dir);
    let _ = open::that_detached(dir);
}

#[tauri::command]
fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    let lower = url.to_lowercase();
    if !(lower.starts_with("https://") || lower.starts_with("http://") || lower.starts_with("mailto:")) {
        return Err("Nur Web-Adressen können geöffnet werden.".into());
    }
    #[cfg(desktop)]
    {
        let _ = &app;
        open::that_detached(url).map_err(|e| e.to_string())
    }
    // Android: hand the link to the phone's browser
    #[cfg(mobile)]
    {
        use tauri_plugin_opener::OpenerExt;
        app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
    }
}

// ---------- media ----------
fn header(req: &Request<'_>, name: &str) -> String {
    let raw = req.headers().get(name).and_then(|v| v.to_str().ok()).unwrap_or("");
    percent_encoding::percent_decode_str(raw).decode_utf8_lossy().into_owned()
}

/// The bytes of a file sent from the page. On the PC they arrive raw; on Android Tauri sends every call as JSON,
/// so Merkora sends {"b64": "…"} there (a plain number list is accepted too).
fn body_bytes(body: &InvokeBody) -> Result<Vec<u8>, String> {
    match body {
        InvokeBody::Raw(bytes) => Ok(bytes.clone()),
        InvokeBody::Json(serde_json::Value::Object(o)) => match o.get("b64").and_then(|v| v.as_str()) {
            Some(b) => base64::engine::general_purpose::STANDARD.decode(b).map_err(|_| "Daten beschädigt.".to_string()),
            None => Err("Keine Daten erhalten.".into()),
        },
        InvokeBody::Json(serde_json::Value::Array(a)) => a
            .iter()
            .map(|v| v.as_u64().filter(|n| *n <= 255).map(|n| n as u8))
            .collect::<Option<Vec<u8>>>()
            .ok_or_else(|| "Daten beschädigt.".to_string()),
        _ => Err("Keine Daten erhalten.".into()),
    }
}

#[tauri::command]
async fn media_put(request: Request<'_>) -> Result<(), String> {
    let bytes = body_bytes(request.body())?;
    storage::media_put(&header(&request, "x-id"), &header(&request, "x-name"), &header(&request, "x-type"), &bytes)
}

#[tauri::command]
async fn media_get(id: String) -> Result<Response, String> {
    let (bytes, _) = storage::media_get(&id).ok_or("Datei nicht gefunden")?;
    Ok(Response::new(bytes))
}

#[tauri::command]
fn media_type(id: String) -> Option<String> {
    storage::media_get(&id).map(|(_, t)| t)
}

#[tauri::command]
fn media_keys() -> Vec<String> {
    storage::media_keys()
}

#[tauri::command]
fn media_delete(ids: Vec<String>) {
    storage::media_delete(&ids)
}

// ---------- Anki import ----------
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportResult {
    decks: Vec<anki::AnkiDeck>,
    styles: HashMap<String, String>,
    media: usize,
    missing_media: usize,
    skipped: usize,
    /// Creation time of the Anki collection (unix seconds), base of review due days.
    crt: i64,
    /// Cards that already have learning progress in Anki.
    with_progress: usize,
}

fn do_import(bytes: &[u8]) -> Result<ImportResult, String> {
    let mut uid = || uuid::Uuid::new_v4().simple().to_string()[..16].to_string();
    let p = anki::parse_apkg(bytes, &mut uid)?;
    let media = storage::media_put_many(p.media.into_iter().map(|m| (m.id, m.name, m.bytes)).collect())?;
    Ok(ImportResult {
        decks: p.decks,
        styles: p.styles,
        media,
        missing_media: p.missing,
        skipped: p.skipped,
        crt: p.crt,
        with_progress: p.with_progress,
    })
}

#[tauri::command]
async fn import_apkg(request: Request<'_>) -> Result<ImportResult, String> {
    let bytes = body_bytes(request.body()).map_err(|_| "Keine Datei erhalten.".to_string())?;
    tauri::async_runtime::spawn_blocking(move || do_import(&bytes)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn import_apkg_path(path: String) -> Result<ImportResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = std::fs::read(&path).map_err(|e| format!("Die Datei konnte nicht gelesen werden: {e}"))?;
        do_import(&bytes)
    })
    .await
    .map_err(|e| e.to_string())?
}

// ---------- export & files for the user ----------
/// Writes a file into the user's Downloads folder (unique name) and shows it in the file manager.
fn save_to_downloads(name: &str, bytes: &[u8]) -> Result<String, String> {
    let dir = dirs::download_dir().or_else(dirs::document_dir).unwrap_or_else(storage::data_dir);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let clean: String = name.chars().map(|c| if r#"<>:"/|?*"#.contains(c) || c.is_control() { '_' } else { c }).collect();
    let (stem, ext) = match clean.rsplit_once('.') {
        Some((s, e)) => (s.to_string(), format!(".{e}")),
        None => (clean.clone(), String::new()),
    };
    let mut path = dir.join(&clean);
    let mut i = 2;
    while path.exists() {
        path = dir.join(format!("{stem} ({i}){ext}"));
        i += 1;
    }
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    reveal(&path);
    Ok(path.to_string_lossy().into_owned())
}

fn reveal(path: &std::path::Path) {
    #[cfg(target_os = "windows")]
    let _ = std::process::Command::new("explorer").arg(format!("/select,{}", path.display())).spawn();
    #[cfg(target_os = "macos")]
    let _ = std::process::Command::new("open").arg("-R").arg(path).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let _ = path.parent().map(open::that_detached);
}

#[tauri::command]
async fn save_download(request: Request<'_>) -> Result<String, String> {
    let bytes = body_bytes(request.body())?;
    save_to_downloads(&header(&request, "x-name"), &bytes)
}

#[tauri::command]
async fn export_apkg(deck: export::ExportDeck) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let bytes = export::build_apkg(&deck, &|id: &str| storage::media_get(id))?;
        save_to_downloads(&format!("{}.apkg", deck.name), &bytes)
    })
    .await
    .map_err(|e| e.to_string())?
}

// ---------- closing, tray ----------
/// Closing is done here, not in the page: the page gets a moment to save, then the app ends
/// (or hides in the tray) – even if the page does not answer.
#[derive(Default)]
struct CloseState {
    /// keep running in the tray when the window is closed
    tray: AtomicBool,
    /// a close is in progress
    closing: AtomicBool,
    /// "Beenden" from the tray menu: always quit
    quit: AtomicBool,
}

#[cfg(desktop)]
fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

fn begin_close(app: &AppHandle) {
    let state = app.state::<CloseState>();
    if state.closing.swap(true, Ordering::SeqCst) {
        return;
    }
    let _ = app.emit("app-closing", ());
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(3));
        if app.state::<CloseState>().closing.load(Ordering::SeqCst) {
            finish(&app);
        }
    });
}

fn finish(app: &AppHandle) {
    let state = app.state::<CloseState>();
    state.closing.store(false, Ordering::SeqCst);
    if state.tray.load(Ordering::SeqCst) && !state.quit.load(Ordering::SeqCst) {
        #[cfg(desktop)]
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.hide();
        }
    } else {
        storage::flush_types();
        app.exit(0);
    }
}

/// Called by the page when it has saved.
#[tauri::command]
fn finish_close(app: AppHandle) {
    finish(&app);
}

#[tauri::command]
fn set_tray_mode(state: tauri::State<'_, CloseState>, on: bool) {
    state.tray.store(on, Ordering::SeqCst);
}

// ---------- backups ----------
#[tauri::command]
fn get_backup_dir() -> Option<String> {
    storage::extra_backup_dir().map(|p| p.to_string_lossy().into_owned())
}
#[tauri::command]
fn set_backup_dir(dir: Option<String>) -> Result<(), String> {
    storage::set_extra_backup_dir(dir)
}
#[tauri::command]
fn list_backups() -> Vec<storage::BackupInfo> {
    storage::list_backups()
}
#[tauri::command]
fn read_backup(path: String) -> Result<String, String> {
    storage::read_backup(&path)
}
#[tauri::command]
fn backup_now() -> Result<String, String> {
    storage::backup_now()
}

// ---------- .apkg files opened with the app ----------
struct OpenFiles(Mutex<Vec<String>>);

fn anki_paths(args: &[String]) -> Vec<String> {
    args.iter()
        .skip(1)
        .filter(|a| {
            let l = a.to_lowercase();
            (l.ends_with(".apkg") || l.ends_with(".colpkg")) && std::path::Path::new(a).is_file()
        })
        .cloned()
        .collect()
}

fn hand_over(app: &AppHandle, files: Vec<String>) {
    if files.is_empty() {
        return;
    }
    if let Some(state) = app.try_state::<OpenFiles>() {
        state.0.lock().unwrap().extend(files.iter().cloned());
    }
    let _ = app.emit("open-file", ());
}

#[tauri::command]
fn take_open_files(state: tauri::State<'_, OpenFiles>) -> Vec<String> {
    std::mem::take(&mut *state.0.lock().unwrap())
}

// ---------- material files: open with the computer's own program (Acrobat, Word …) ----------
/// A file name that is safe to use in the temporary folder.
fn safe_file_name(name: &str) -> String {
    let clean: String = name.chars().map(|c| if r#"<>:"/\|?*"#.contains(c) || c.is_control() { '_' } else { c }).collect();
    let clean = clean.trim().trim_matches('.').to_string();
    if clean.is_empty() { "Datei".into() } else { clean }
}

#[tauri::command]
fn open_media_file(id: String, name: String) -> Result<(), String> {
    #[cfg(desktop)]
    {
        let (bytes, _) = storage::media_get(&id).ok_or("Die Datei ist auf diesem Gerät nicht gespeichert.")?;
        let dir = std::env::temp_dir().join("Merkora-Dateien");
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let path = dir.join(safe_file_name(&name));
        std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
        open::that_detached(&path).map_err(|e| e.to_string())
    }
    #[cfg(mobile)]
    {
        let _ = (id, name);
        Err("Auf dem Handy bitte „Herunterladen“ nutzen.".into())
    }
}

#[cfg(test)]
mod body_tests {
    use super::body_bytes;
    use tauri::ipc::InvokeBody;
    #[test]
    fn bytes_from_pc_and_android() {
        assert_eq!(body_bytes(&InvokeBody::Raw(vec![1, 2, 255])).unwrap(), vec![1, 2, 255]);
        assert_eq!(body_bytes(&InvokeBody::Json(serde_json::json!({ "b64": "AQL/" }))).unwrap(), vec![1, 2, 255]);
        assert_eq!(body_bytes(&InvokeBody::Json(serde_json::json!([1, 2, 255]))).unwrap(), vec![1, 2, 255]);
        assert!(body_bytes(&InvokeBody::Json(serde_json::json!([1, 256]))).is_err());
        assert!(body_bytes(&InvokeBody::Json(serde_json::json!({ "b64": "%%" }))).is_err());
        assert!(body_bytes(&InvokeBody::Json(serde_json::json!({}))).is_err());
    }
}

#[cfg(test)]
mod file_name_tests {
    #[test]
    fn safe_names() {
        assert_eq!(super::safe_file_name("Vorlesung 3: Teil/2.pdf"), "Vorlesung 3_ Teil_2.pdf");
        assert_eq!(super::safe_file_name("..."), "Datei");
    }
}

// ---------- Android: in-app update (download the new APK; the phone's installer does the rest) ----------
const APK_BASE: &str = "https://github.com/Bobanes1/Merkora/releases/download/";

/// Only Merkora's own release files may be downloaded as an update.
fn is_allowed_apk_url(url: &str) -> bool {
    url.starts_with(APK_BASE) && url.ends_with(".apk") && !url.contains("..") && !url.contains('?') && !url.contains('#') && !url[APK_BASE.len()..].contains("//")
}

#[tauri::command]
async fn download_apk(app: AppHandle, url: String) -> Result<String, String> {
    if !is_allowed_apk_url(&url) {
        return Err("Diese Adresse ist kein Merkora-Update.".into());
    }
    let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("updates");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let file = dir.join("merkora-update.apk");
    let mut res = CLIENT.get(&url).send().await.map_err(|e| format!("Download fehlgeschlagen: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("Download fehlgeschlagen ({}).", res.status()));
    }
    let total = res.content_length().unwrap_or(0);
    let mut data: Vec<u8> = Vec::with_capacity(total as usize);
    let mut last = 0u64;
    while let Some(chunk) = res.chunk().await.map_err(|e| format!("Download abgebrochen: {e}"))? {
        data.extend_from_slice(&chunk);
        let got = data.len() as u64;
        if total > 0 && (got - last) * 50 >= total {
            last = got;
            let _ = app.emit("apk-progress", got as f64 / total as f64);
        }
    }
    std::fs::write(&file, &data).map_err(|e| e.to_string())?;
    let _ = app.emit("apk-progress", 1.0f64);
    Ok(file.to_string_lossy().into_owned())
}

#[cfg(test)]
mod apk_tests {
    use super::is_allowed_apk_url;
    #[test]
    fn only_merkora_release_apks() {
        assert!(is_allowed_apk_url("https://github.com/Bobanes1/Merkora/releases/download/v0.9.1/Merkora_0.9.1_android.apk"));
        assert!(!is_allowed_apk_url("https://example.com/Merkora.apk"));
        assert!(!is_allowed_apk_url("https://github.com/Bobanes1/Merkora/releases/download/v1/../../../other/x.apk"));
        assert!(!is_allowed_apk_url("https://github.com/Bobanes1/Merkora/releases/download/v1/x.exe"));
        assert!(!is_allowed_apk_url("https://github.com/Bobanes1/Merkora/releases/download/v1/x.apk?y=1"));
        assert!(!is_allowed_apk_url("https://github.com/Bobanes1/Merkoraevil/releases/download/v1/x.apk"));
    }
}

// ---------- AI requests (sent from here, so no browser restrictions apply) ----------
#[derive(Deserialize)]
struct FetchReq {
    url: String,
    method: Option<String>,
    #[serde(default)]
    headers: HashMap<String, String>,
    body: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FetchRes {
    status: u16,
    status_text: String,
    content_type: String,
    /// base64
    body: String,
}

static CLIENT: Lazy<reqwest::Client> = Lazy::new(|| {
    reqwest::Client::builder()
        .user_agent(concat!("Merkora/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(std::time::Duration::from_secs(20))
        .timeout(std::time::Duration::from_secs(900))
        .build()
        .expect("http client")
});

#[tauri::command]
async fn http_fetch(req: FetchReq) -> Result<FetchRes, String> {
    let method = reqwest::Method::from_bytes(req.method.as_deref().unwrap_or("GET").as_bytes()).map_err(|e| e.to_string())?;
    let mut rb = CLIENT.request(method, &req.url);
    for (k, v) in &req.headers {
        if k.eq_ignore_ascii_case("anthropic-dangerous-direct-browser-access") {
            continue;
        }
        rb = rb.header(k, v);
    }
    if let Some(b) = req.body {
        rb = rb.body(b);
    }
    let res = rb.send().await.map_err(|e| {
        if e.is_timeout() {
            "Zeitüberschreitung".to_string()
        } else if e.is_connect() {
            format!("Keine Verbindung zu {}", e.url().map(|u| u.host_str().unwrap_or("").to_string()).unwrap_or_default())
        } else {
            e.to_string()
        }
    })?;
    let status = res.status();
    let content_type = res.headers().get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
    let bytes = res.bytes().await.map_err(|e| e.to_string())?;
    Ok(FetchRes {
        status: status.as_u16(),
        status_text: status.canonical_reason().unwrap_or("").to_string(),
        content_type,
        body: base64::engine::general_purpose::STANDARD.encode(&bytes),
    })
}

// ---------- self-test (used when building) ----------
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SmokeInfo {
    apkg: Option<String>,
    /// also download an available update (checks its signature, does not install)
    update_download: bool,
}
#[tauri::command]
fn smoke_info() -> Option<SmokeInfo> {
    std::env::var("MERKORA_SMOKE").ok().map(|_| SmokeInfo { apkg: std::env::var("MERKORA_SMOKE_APKG").ok(), update_download: std::env::var("MERKORA_SMOKE_UPDATE").is_ok() })
}
#[tauri::command]
fn smoke_done(app: AppHandle, report: serde_json::Value, exit: Option<bool>) {
    if let Ok(file) = std::env::var("MERKORA_SMOKE") {
        let _ = std::fs::write(file, serde_json::to_string_pretty(&report).unwrap_or_default());
    }
    storage::flush_types();
    // exit = false: the self-test then closes the window like a user (tests the normal closing path)
    if exit != Some(false) {
        app.exit(0);
    }
}

// ---------- media protocol: media://localhost/<id> (Windows: http://media.localhost/<id>) ----------
fn media_response(path: &str) -> tauri::http::Response<Vec<u8>> {
    let id = path.trim_start_matches('/').split(['?', '#']).next().unwrap_or("");
    let id = percent_encoding::percent_decode_str(id).decode_utf8_lossy();
    match storage::media_get(&id) {
        Some((bytes, mime)) => tauri::http::Response::builder()
            .status(200)
            .header("Content-Type", mime)
            .header("Access-Control-Allow-Origin", "*")
            .header("Cache-Control", "max-age=31536000, immutable")
            .body(bytes)
            .unwrap(),
        None => tauri::http::Response::builder().status(404).body(Vec::new()).unwrap(),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default();
    // The self-test runs next to an open Merkora without handing over to it.
    #[cfg(desktop)]
    if std::env::var("MERKORA_SMOKE").is_err() {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            hand_over(app, anki_paths(&argv));
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }));
    }
    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_window_state::Builder::default().build())
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--minimized"])));
    }
    let app = builder
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(CloseState::default())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    begin_close(window.app_handle());
                }
            }
        })
        .manage(OpenFiles(Mutex::new(anki_paths(&std::env::args().collect::<Vec<_>>()))))
        .register_asynchronous_uri_scheme_protocol("media", |_ctx, request, responder| {
            let path = request.uri().path().to_string();
            std::thread::spawn(move || responder.respond(media_response(&path)));
        })
        .invoke_handler(tauri::generate_handler![
            load_data,
            save_data,
            save_data_now,
            data_folder,
            open_data_folder,
            open_external,
            media_put,
            media_get,
            media_type,
            media_keys,
            media_delete,
            import_apkg,
            import_apkg_path,
            take_open_files,
            http_fetch,
            download_apk,
            open_media_file,
            smoke_info,
            smoke_done,
            save_download,
            export_apkg,
            finish_close,
            set_tray_mode,
            get_backup_dir,
            set_backup_dir,
            list_backups,
            read_backup,
            backup_now,
        ])
        .setup(|app| {
            // Android: learning data and pictures live in the app's own private folder
            #[cfg(mobile)]
            if std::env::var("MERKORA_DATA_DIR").is_err() {
                if let Ok(dir) = app.path().app_data_dir() {
                    std::env::set_var("MERKORA_DATA_DIR", dir);
                }
            }
            let handle = app.handle().clone();
            let url = if cfg!(debug_assertions) {
                WebviewUrl::App("dashboard".into())
            } else {
                match server::start(&handle) {
                    Some(port) => WebviewUrl::External(format!("http://localhost:{port}/dashboard").parse().unwrap()),
                    None => WebviewUrl::App("dashboard".into()),
                }
            };
            #[allow(unused_mut)]
            let mut win = WebviewWindowBuilder::new(app, "main", url);
            // Android: one full-screen window, nothing more to set up
            #[cfg(mobile)]
            {
                win.build()?;
                Ok(())
            }
            #[cfg(desktop)]
            {
            // The self-test gets its own browser storage, so it never touches the real app's data.
            if std::env::var("MERKORA_SMOKE").is_ok() {
                win = win.data_directory(storage::data_dir().join("webview-test"));
            }
            // Started with the system (autostart): wait in the tray.
            let minimized = std::env::args().any(|a| a == "--minimized");
            if minimized {
                app.state::<CloseState>().tray.store(true, Ordering::SeqCst);
            }
            win.title("Merkora")
                .visible(!minimized)
                .inner_size(1280.0, 840.0)
                .min_inner_size(380.0, 560.0)
                .disable_drag_drop_handler()
                .zoom_hotkeys_enabled(true)
                .build()?;

            // Tray icon: click opens the window, menu "Merkora öffnen" / "Beenden".
            use tauri::menu::{Menu, MenuItem};
            use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
            let open_item = MenuItem::with_id(app, "open", "Merkora öffnen", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Beenden", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_item, &quit_item])?;
            let mut tray = TrayIconBuilder::with_id("main").tooltip("Merkora").menu(&menu).show_menu_on_left_click(false);
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.on_menu_event(|app, e| match e.id.as_ref() {
                "open" => show_main(app),
                "quit" => {
                    app.state::<CloseState>().quit.store(true, Ordering::SeqCst);
                    begin_close(app);
                }
                _ => {}
            })
            .on_tray_icon_event(|tray, e| {
                if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                    show_main(tray.app_handle());
                }
            })
            .build(app)?;
            Ok(())
            }
        })
        .build(tauri::generate_context!())
        .expect("Merkora konnte nicht gestartet werden");

    app.run(|_handle, _event| {
        #[cfg(any(target_os = "macos", target_os = "ios"))]
        if let tauri::RunEvent::Opened { urls } = &_event {
            let files: Vec<String> = urls
                .iter()
                .filter_map(|u| u.to_file_path().ok())
                .map(|p| p.to_string_lossy().into_owned())
                .filter(|p| p.to_lowercase().ends_with(".apkg") || p.to_lowercase().ends_with(".colpkg"))
                .collect();
            hand_over(_handle, files);
        }
        if let tauri::RunEvent::Exit = _event {
            storage::flush_types();
        }
    });
}
