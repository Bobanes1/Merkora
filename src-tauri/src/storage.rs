//! Save file with daily backups, and card media (pictures, sounds, fonts) as files on disk.

use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Same folder the earlier Windows version used (%APPDATA%\Merkora), so existing learning data is picked up.
pub fn data_dir() -> PathBuf {
    if let Ok(p) = std::env::var("MERKORA_DATA_DIR") {
        return PathBuf::from(p);
    }
    dirs::config_dir().unwrap_or_else(std::env::temp_dir).join("Merkora")
}
pub fn data_file() -> PathBuf {
    data_dir().join("merkora-lernstand.json")
}
fn backup_dir() -> PathBuf {
    data_dir().join("Sicherungen")
}
pub fn media_dir() -> PathBuf {
    data_dir().join("Medien")
}

fn write_atomic(file: &Path, data: &[u8]) -> std::io::Result<()> {
    if let Some(dir) = file.parent() {
        fs::create_dir_all(dir)?;
    }
    let tmp = file.with_extension("tmp");
    fs::write(&tmp, data)?;
    fs::rename(&tmp, file)
}

pub fn load() -> Option<String> {
    fs::read_to_string(data_file()).ok()
}

static LAST_BACKUP: Lazy<Mutex<Option<Instant>>> = Lazy::new(|| Mutex::new(None));

pub fn save(text: &str) -> Result<(), String> {
    if text.len() < 10 {
        return Ok(());
    }
    write_atomic(&data_file(), text.as_bytes()).map_err(|e| e.to_string())?;
    let mut last = LAST_BACKUP.lock().unwrap();
    if last.map(|t| t.elapsed() > Duration::from_secs(600)).unwrap_or(true) {
        *last = Some(Instant::now());
        backup_daily(text);
    }
    Ok(())
}

/// One backup per day, the last 14 days are kept – in the data folder and, if chosen, in the user's own folder.
fn backup_daily(text: &str) {
    let day = chrono::Local::now().format("%Y-%m-%d").to_string();
    for dir in backup_dirs() {
        if fs::create_dir_all(&dir).is_err() {
            continue;
        }
        let _ = fs::write(dir.join(format!("lernstand-{day}.json")), text);
        rotate(&dir);
    }
}

fn rotate(dir: &Path) {
    if let Ok(entries) = fs::read_dir(dir) {
        let mut names: Vec<String> = entries
            .flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|n| n.starts_with("lernstand-") && n.ends_with(".json") && n.len() == "lernstand-2000-01-01.json".len())
            .collect();
        names.sort();
        if names.len() > 14 {
            for n in &names[..names.len() - 14] {
                let _ = fs::remove_file(dir.join(n));
            }
        }
    }
}

// ---------- own backup folder & restore ----------
fn prefs_file() -> PathBuf {
    data_dir().join("einstellungen.json")
}
fn prefs() -> serde_json::Value {
    fs::read(prefs_file()).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_else(|| serde_json::json!({}))
}
/// The extra backup folder the user chose (e.g. in OneDrive), if any.
pub fn extra_backup_dir() -> Option<PathBuf> {
    prefs()["backupDir"].as_str().filter(|s| !s.is_empty()).map(PathBuf::from)
}
pub fn set_extra_backup_dir(dir: Option<String>) -> Result<(), String> {
    if let Some(d) = &dir {
        let path = PathBuf::from(d);
        fs::create_dir_all(&path).map_err(|e| format!("Der Ordner kann nicht benutzt werden: {e}"))?;
        let probe = path.join(".merkora-test");
        fs::write(&probe, b"ok").map_err(|e| format!("In diesen Ordner kann nicht geschrieben werden: {e}"))?;
        let _ = fs::remove_file(probe);
    }
    let mut p = prefs();
    p["backupDir"] = dir.map(serde_json::Value::String).unwrap_or(serde_json::Value::Null);
    write_atomic(&prefs_file(), serde_json::to_vec_pretty(&p).unwrap_or_default().as_slice()).map_err(|e| e.to_string())
}
fn backup_dirs() -> Vec<PathBuf> {
    let mut v = vec![backup_dir()];
    if let Some(d) = extra_backup_dir() {
        v.push(d.join("Merkora-Sicherungen"));
    }
    v
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub path: String,
    pub name: String,
    pub modified: i64,
    pub size: u64,
    /// "lokal" or "eigener Ordner"
    pub place: String,
}

pub fn list_backups() -> Vec<BackupInfo> {
    let mut out = vec![];
    for (i, dir) in backup_dirs().into_iter().enumerate() {
        let Ok(entries) = fs::read_dir(&dir) else { continue };
        for e in entries.flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            if !(name.starts_with("lernstand-") && name.ends_with(".json")) {
                continue;
            }
            let Ok(meta) = e.metadata() else { continue };
            let modified = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0);
            out.push(BackupInfo {
                path: e.path().to_string_lossy().into_owned(),
                name,
                modified,
                size: meta.len(),
                place: if i == 0 { "lokal".into() } else { "eigener Ordner".into() },
            });
        }
    }
    out.sort_by(|a, b| b.modified.cmp(&a.modified));
    out
}

/// Reads a backup – only files inside the backup folders are allowed.
pub fn read_backup(path: &str) -> Result<String, String> {
    let p = fs::canonicalize(path).map_err(|e| e.to_string())?;
    let allowed = backup_dirs().into_iter().filter_map(|d| fs::canonicalize(d).ok()).any(|d| p.starts_with(&d));
    if !allowed {
        return Err("Diese Datei ist keine Merkora-Sicherung.".into());
    }
    fs::read_to_string(p).map_err(|e| e.to_string())
}

/// Saves the current save file as an extra backup right now (kept, not rotated). Returns its name.
pub fn backup_now() -> Result<String, String> {
    let text = load().ok_or("Es gibt noch keinen gespeicherten Lernstand.")?;
    let name = format!("lernstand-{}-manuell.json", chrono::Local::now().format("%Y-%m-%d-%H%M%S"));
    for dir in backup_dirs() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        fs::write(dir.join(&name), &text).map_err(|e| e.to_string())?;
    }
    Ok(name)
}

// ---------- media ----------
fn safe_id(id: &str) -> Option<&str> {
    (!id.is_empty() && id.len() <= 80 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')).then_some(id)
}

fn types_file() -> PathBuf {
    media_dir().join("typen.json")
}
static TYPES: Lazy<Mutex<Option<HashMap<String, String>>>> = Lazy::new(|| Mutex::new(None));

fn with_types<T>(f: impl FnOnce(&mut HashMap<String, String>) -> T) -> T {
    let mut g = TYPES.lock().unwrap();
    if g.is_none() {
        let m = fs::read(types_file()).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
        *g = Some(m);
    }
    f(g.as_mut().unwrap())
}
fn save_types(m: &HashMap<String, String>) {
    if let Ok(b) = serde_json::to_vec(m) {
        let _ = write_atomic(&types_file(), &b);
    }
}

pub fn mime_from_name(name: &str) -> &'static str {
    let ext = name.rsplit('.').next().unwrap_or("").to_lowercase();
    match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "avif" => "image/avif",
        "ico" => "image/x-icon",
        "tif" | "tiff" => "image/tiff",
        "mp3" => "audio/mpeg",
        "ogg" | "oga" | "opus" => "audio/ogg",
        "wav" => "audio/wav",
        "m4a" => "audio/mp4",
        "aac" => "audio/aac",
        "flac" => "audio/flac",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "css" => "text/css",
        _ => "application/octet-stream",
    }
}

/// Guesses the type from the first bytes when the name does not tell.
fn sniff(bytes: &[u8]) -> &'static str {
    let starts = |p: &[u8]| bytes.len() >= p.len() && &bytes[..p.len()] == p;
    if starts(&[0x89, b'P', b'N', b'G']) {
        "image/png"
    } else if starts(&[0xff, 0xd8, 0xff]) {
        "image/jpeg"
    } else if starts(b"GIF8") {
        "image/gif"
    } else if bytes.len() > 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        "image/webp"
    } else if bytes.len() > 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WAVE" {
        "audio/wav"
    } else if starts(b"ID3") || starts(&[0xff, 0xfb]) || starts(&[0xff, 0xf3]) {
        "audio/mpeg"
    } else if starts(b"OggS") {
        "audio/ogg"
    } else if starts(b"<svg") || starts(b"<?xml") {
        "image/svg+xml"
    } else {
        "application/octet-stream"
    }
}

pub fn media_put(id: &str, name: &str, mime: &str, bytes: &[u8]) -> Result<(), String> {
    let id = safe_id(id).ok_or("ungültige Medien-ID")?;
    let mut mime = if mime.is_empty() || mime == "application/octet-stream" { mime_from_name(name) } else { mime };
    if mime == "application/octet-stream" {
        mime = sniff(bytes);
    }
    write_atomic(&media_dir().join(id), bytes).map_err(|e| e.to_string())?;
    let mime = mime.to_string();
    with_types(|m| {
        m.insert(id.to_string(), mime);
    });
    Ok(())
}

/// Stores many files and writes the type list only once.
pub fn media_put_many(items: Vec<(String, String, Vec<u8>)>) -> Result<usize, String> {
    let dir = media_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut types = vec![];
    for (id, name, bytes) in &items {
        let Some(id) = safe_id(id) else { continue };
        let mut mime = mime_from_name(name);
        if mime == "application/octet-stream" {
            mime = sniff(bytes);
        }
        fs::write(dir.join(id), bytes).map_err(|e| e.to_string())?;
        types.push((id.to_string(), mime.to_string()));
    }
    let n = types.len();
    with_types(|m| {
        m.extend(types);
        save_types(m);
    });
    Ok(n)
}

pub fn flush_types() {
    with_types(|m| save_types(m));
}

pub fn media_get(id: &str) -> Option<(Vec<u8>, String)> {
    let id = safe_id(id)?;
    let bytes = fs::read(media_dir().join(id)).ok()?;
    let mime = with_types(|m| m.get(id).cloned()).unwrap_or_else(|| sniff(&bytes).to_string());
    Some((bytes, mime))
}

pub fn media_keys() -> Vec<String> {
    fs::read_dir(media_dir())
        .map(|rd| {
            rd.flatten()
                .map(|e| e.file_name().to_string_lossy().into_owned())
                .filter(|n| safe_id(n).is_some())
                .collect()
        })
        .unwrap_or_default()
}

pub fn media_delete(ids: &[String]) {
    let dir = media_dir();
    for id in ids {
        if let Some(id) = safe_id(id) {
            let _ = fs::remove_file(dir.join(id));
        }
    }
    with_types(|m| {
        for id in ids {
            m.remove(id);
        }
        save_types(m);
    });
}
