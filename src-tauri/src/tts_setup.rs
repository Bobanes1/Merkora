//! Offline Neural Text-to-Speech (Piper): Merkora downloads the official Piper binary (rhasspy/piper)
//! and individual ONNX neural voice models (rhasspy/piper-voices v1.0.0) into its own data folder on demand.
//! No admin rights, 100 % offline after download, with a local WAV cache for instant flashcard playback.

use serde::Serialize;
use std::path::{Path, PathBuf};

/// Official Piper standalone release (matches rhasspy/piper-voices v1.0.0 models).
pub const PIPER_RELEASE_BASE: &str = "https://github.com/rhasspy/piper/releases/download/2023.11.14-2";
/// Official Hugging Face voice repository pinned to v1.0.0 for permanent compatibility with Piper 2023.11.14-2.
pub const VOICES_BASE: &str = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0";

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TtsVoiceInfo {
    pub id: &'static str,
    pub lang: &'static str,
    pub locale: &'static str,
    pub name: &'static str,
    pub label: &'static str,
    pub quality: &'static str,
    pub size_mb: u32,
    pub recommended: bool,
    #[serde(skip)]
    pub hf_dir: &'static str,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TtsStatus {
    pub supported: bool,
    pub engine_installed: bool,
    pub installed_voices: Vec<String>,
    pub catalog: Vec<TtsVoiceInfo>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TtsProgress {
    pub voice_id: String,
    pub progress: f64,
    pub stage: String,
}

pub const CATALOG: &[TtsVoiceInfo] = &[
    TtsVoiceInfo {
        id: "de_DE-thorsten-medium",
        lang: "de",
        locale: "de-DE",
        name: "Thorsten",
        label: "Deutsch · Thorsten (klar & ausgewogen)",
        quality: "medium",
        size_mb: 63,
        recommended: true,
        hf_dir: "de/de_DE/thorsten/medium",
    },
    TtsVoiceInfo {
        id: "de_DE-thorsten-high",
        lang: "de",
        locale: "de-DE",
        name: "Thorsten HD",
        label: "Deutsch · Thorsten HD (Studio-Qualität)",
        quality: "high",
        size_mb: 114,
        recommended: false,
        hf_dir: "de/de_DE/thorsten/high",
    },
    TtsVoiceInfo {
        id: "de_DE-kerstin-low",
        lang: "de",
        locale: "de-DE",
        name: "Kerstin",
        label: "Deutsch · Kerstin (weiblich, sanft)",
        quality: "low",
        size_mb: 63,
        recommended: false,
        hf_dir: "de/de_DE/kerstin/low",
    },
    TtsVoiceInfo {
        id: "en_US-amy-medium",
        lang: "en",
        locale: "en-US",
        name: "Amy",
        label: "Englisch (US) · Amy",
        quality: "medium",
        size_mb: 63,
        recommended: true,
        hf_dir: "en/en_US/amy/medium",
    },
    TtsVoiceInfo {
        id: "en_GB-alba-medium",
        lang: "en",
        locale: "en-GB",
        name: "Alba",
        label: "Englisch (UK) · Alba",
        quality: "medium",
        size_mb: 63,
        recommended: false,
        hf_dir: "en/en_GB/alba/medium",
    },
    TtsVoiceInfo {
        id: "fr_FR-siwis-medium",
        lang: "fr",
        locale: "fr-FR",
        name: "Siwis",
        label: "Französisch · Siwis",
        quality: "medium",
        size_mb: 63,
        recommended: false,
        hf_dir: "fr/fr_FR/siwis/medium",
    },
    TtsVoiceInfo {
        id: "es_ES-davefx-medium",
        lang: "es",
        locale: "es-ES",
        name: "DaveFX",
        label: "Spanisch · DaveFX",
        quality: "medium",
        size_mb: 63,
        recommended: false,
        hf_dir: "es/es_ES/davefx/medium",
    },
    TtsVoiceInfo {
        id: "it_IT-paola-medium",
        lang: "it",
        locale: "it-IT",
        name: "Paola",
        label: "Italienisch · Paola",
        quality: "medium",
        size_mb: 63,
        recommended: false,
        hf_dir: "it/it_IT/paola/medium",
    },
];

pub fn tts_root() -> PathBuf {
    crate::storage::data_dir().join("tts")
}

pub fn engine_dir() -> PathBuf {
    tts_root().join("bin")
}

pub fn voices_dir() -> PathBuf {
    tts_root().join("voices")
}

pub fn cache_dir() -> PathBuf {
    tts_root().join("cache")
}

pub fn voice_info(id: &str) -> Option<&'static TtsVoiceInfo> {
    CATALOG.iter().find(|v| v.id == id)
}

pub fn voice_urls(v: &TtsVoiceInfo) -> (String, String) {
    let base = format!("{VOICES_BASE}/{}/{}", v.hf_dir, v.id);
    (format!("{base}.onnx"), format!("{base}.onnx.json"))
}

/// Official Piper standalone archive name and approximate byte size for this OS/CPU.
pub fn platform_asset(os: &str, arch: &str) -> Result<(&'static str, u64), String> {
    match (os, arch) {
        ("windows", "x86_64") => Ok(("piper_windows_amd64.zip", 22_477_236)),
        ("macos", "aarch64") => Ok(("piper_macos_aarch64.tar.gz", 19_146_957)),
        ("macos", "x86_64") => Ok(("piper_macos_x64.tar.gz", 19_146_927)),
        ("linux", "x86_64") => Ok(("piper_linux_x86_64.tar.gz", 26_460_462)),
        ("linux", "aarch64") => Ok(("piper_linux_aarch64.tar.gz", 26_004_717)),
        _ => Err("Für dieses System ist die lokale Neural-Sprachausgabe nicht verfügbar.".into()),
    }
}

/// Finds `piper(.exe)` in an unpacked archive directory.
pub fn find_piper(dir: &Path, depth: u32) -> Option<PathBuf> {
    let exe = if cfg!(windows) { "piper.exe" } else { "piper" };
    let here = dir.join(exe);
    if here.is_file() {
        return Some(here);
    }
    if depth >= 3 {
        return None;
    }
    let mut dirs: Vec<PathBuf> = std::fs::read_dir(dir)
        .ok()?
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_dir())
        .collect();
    dirs.sort();
    dirs.iter().find_map(|p| find_piper(p, depth + 1))
}

pub fn bundled_piper() -> Option<PathBuf> {
    find_piper(&engine_dir(), 0)
}

/// Returns `(onnx, config_json)` if the voice is completely installed on disk.
pub fn voice_files(id: &str) -> Option<(PathBuf, PathBuf)> {
    voice_info(id)?;
    let dir = voices_dir();
    let onnx = dir.join(format!("{id}.onnx"));
    let cfg = dir.join(format!("{id}.onnx.json"));
    let ok_onnx = std::fs::metadata(&onnx).map(|m| m.len() > 1_000_000).unwrap_or(false);
    let ok_cfg = std::fs::metadata(&cfg).map(|m| m.len() > 100).unwrap_or(false);
    if ok_onnx && ok_cfg {
        Some((onnx, cfg))
    } else {
        None
    }
}

pub fn installed_voices() -> Vec<String> {
    CATALOG
        .iter()
        .filter(|v| voice_files(v.id).is_some())
        .map(|v| v.id.to_string())
        .collect()
}

pub fn status() -> TtsStatus {
    let supported = cfg!(desktop) && platform_asset(std::env::consts::OS, std::env::consts::ARCH).is_ok();
    TtsStatus {
        supported,
        engine_installed: supported && bundled_piper().is_some(),
        installed_voices: if supported { installed_voices() } else { Vec::new() },
        catalog: CATALOG.to_vec(),
    }
}

pub fn cache_key(voice_id: &str, text: &str) -> String {
    let mut h = sha1_smol::Sha1::new();
    h.update(voice_id.as_bytes());
    h.update(b"\n");
    h.update(text.as_bytes());
    h.digest().to_string()
}

#[cfg(desktop)]
static TTS_DOWNLOAD: once_cell::sync::Lazy<reqwest::Client> = once_cell::sync::Lazy::new(|| {
    reqwest::Client::builder()
        .user_agent(concat!("Merkora/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(std::time::Duration::from_secs(20))
        .read_timeout(std::time::Duration::from_secs(60))
        .no_gzip()
        .build()
        .expect("tts http client")
});

/// Downloads & unpacks the Piper engine into `tts/bin` (if not already present).
#[cfg(desktop)]
async fn ensure_engine(progress: impl Fn(f64)) -> Result<(), String> {
    if bundled_piper().is_some() {
        return Ok(());
    }
    let (asset_name, approx_size) = platform_asset(std::env::consts::OS, std::env::consts::ARCH)?;
    let url = format!("{PIPER_RELEASE_BASE}/{asset_name}");
    let root = tts_root();
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let archive = root.join(format!("download-{asset_name}"));
    let mut file = std::fs::File::create(&archive).map_err(|e| e.to_string())?;
    let mut last = 0u64;
    let res = crate::java_setup::download_resumable(&TTS_DOWNLOAD, &url, &mut file, 4, |got| {
        if approx_size > 0 && got.abs_diff(last) * 80 >= approx_size {
            last = got;
            progress((got.min(approx_size)) as f64 / approx_size as f64 * 0.9);
        }
    })
    .await;
    drop(file);
    if let Err(e) = res {
        let _ = std::fs::remove_file(&archive);
        return Err(format!("Sprach-Engine konnte nicht geladen werden: {e}"));
    }
    progress(0.92);
    let name = asset_name.to_string();
    let dest = engine_dir();
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let fresh = root.join("bin-new");
        let _ = std::fs::remove_dir_all(&fresh);
        let r = crate::java_setup::unpack(&archive, &name, &fresh);
        let _ = std::fs::remove_file(&archive);
        r?;
        let Some(exe) = find_piper(&fresh, 0) else {
            let _ = std::fs::remove_dir_all(&fresh);
            return Err("Im Download wurde die Piper-Engine nicht gefunden.".into());
        };
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if let Ok(meta) = std::fs::metadata(&exe) {
                let mut perms = meta.permissions();
                perms.set_mode(0o755);
                let _ = std::fs::set_permissions(&exe, perms);
            }
        }
        let _ = std::fs::remove_dir_all(&dest);
        std::fs::rename(&fresh, &dest).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())??;
    progress(1.0);
    Ok(())
}

/// Downloads the Piper engine (if needed) and the requested neural voice model + config.
#[cfg(desktop)]
pub async fn install_voice(voice_id: &str, on_progress: impl Fn(TtsProgress)) -> Result<TtsStatus, String> {
    let voice = voice_info(voice_id).ok_or_else(|| format!("Unbekannte Stimme: {voice_id}"))?;
    let need_engine = bundled_piper().is_none();

    if need_engine {
        on_progress(TtsProgress {
            voice_id: voice_id.into(),
            progress: 0.0,
            stage: "engine".into(),
        });
        ensure_engine(|p| {
            on_progress(TtsProgress {
                voice_id: voice_id.into(),
                progress: p * 0.32,
                stage: if p >= 0.9 { "unpack".into() } else { "engine".into() },
            });
        })
        .await?;
    }

    let base_p = if need_engine { 0.34 } else { 0.0 };
    let span_p = 1.0 - base_p;

    let vdir = voices_dir();
    std::fs::create_dir_all(&vdir).map_err(|e| e.to_string())?;
    let (onnx_url, json_url) = voice_urls(voice);

    // 1. Download small .onnx.json config
    let tmp_cfg = vdir.join(format!("{voice_id}.onnx.json.part"));
    let final_cfg = vdir.join(format!("{voice_id}.onnx.json"));
    {
        let mut f = std::fs::File::create(&tmp_cfg).map_err(|e| e.to_string())?;
        let r = crate::java_setup::download_resumable(&TTS_DOWNLOAD, &json_url, &mut f, 3, |_| {}).await;
        drop(f);
        if let Err(e) = r {
            let _ = std::fs::remove_file(&tmp_cfg);
            return Err(format!("Stimm-Konfiguration konnte nicht geladen werden: {e}"));
        }
    }

    // 2. Download .onnx neural model with progress
    let tmp_onnx = vdir.join(format!("{voice_id}.onnx.part"));
    let final_onnx = vdir.join(format!("{voice_id}.onnx"));
    let approx = (voice.size_mb as u64) * 1_000_000;
    on_progress(TtsProgress {
        voice_id: voice_id.into(),
        progress: base_p + 0.02,
        stage: "voice".into(),
    });
    {
        let mut f = std::fs::File::create(&tmp_onnx).map_err(|e| e.to_string())?;
        let mut last = 0u64;
        let r = crate::java_setup::download_resumable(&TTS_DOWNLOAD, &onnx_url, &mut f, 4, |got| {
            if approx > 0 && got.abs_diff(last) * 80 >= approx {
                last = got;
                let frac = (got.min(approx)) as f64 / approx as f64;
                on_progress(TtsProgress {
                    voice_id: voice_id.into(),
                    progress: base_p + 0.02 + frac * (span_p - 0.04),
                    stage: "voice".into(),
                });
            }
        })
        .await;
        drop(f);
        if let Err(e) = r {
            let _ = std::fs::remove_file(&tmp_onnx);
            let _ = std::fs::remove_file(&tmp_cfg);
            return Err(format!("Stimm-Modell konnte nicht geladen werden: {e}"));
        }
    }

    std::fs::rename(&tmp_cfg, &final_cfg).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp_onnx, &final_onnx).map_err(|e| e.to_string())?;

    on_progress(TtsProgress {
        voice_id: voice_id.into(),
        progress: 1.0,
        stage: "done".into(),
    });
    Ok(status())
}

#[cfg(desktop)]
pub fn remove_voice(voice_id: &str) -> Result<TtsStatus, String> {
    voice_info(voice_id).ok_or_else(|| format!("Unbekannte Stimme: {voice_id}"))?;
    let vdir = voices_dir();
    let _ = std::fs::remove_file(vdir.join(format!("{voice_id}.onnx")));
    let _ = std::fs::remove_file(vdir.join(format!("{voice_id}.onnx.json")));
    Ok(status())
}

#[cfg(desktop)]
pub fn uninstall_all() -> Result<TtsStatus, String> {
    let root = tts_root();
    if root.exists() {
        std::fs::remove_dir_all(&root).map_err(|e| format!("Konnte Sprachdaten nicht entfernen: {e}"))?;
    }
    Ok(status())
}

/// Keeps the WAV cache compact (at most ~160 recently spoken clips).
#[cfg(desktop)]
fn prune_cache(dir: &Path) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    let mut files: Vec<(PathBuf, std::time::SystemTime)> = entries
        .flatten()
        .filter_map(|e| {
            let p = e.path();
            if p.extension().and_then(|s| s.to_str()) != Some("wav") {
                return None;
            }
            let t = e.metadata().ok()?.modified().ok()?;
            Some((p, t))
        })
        .collect();
    if files.len() <= 160 {
        return;
    }
    files.sort_by_key(|(_, t)| *t);
    for (p, _) in files.iter().take(files.len() - 120) {
        let _ = std::fs::remove_file(p);
    }
}

/// Synthesizes `text` using the installed Piper voice and returns raw WAV bytes (cached on disk).
#[cfg(desktop)]
pub fn synthesize(voice_id: &str, raw_text: &str) -> Result<Vec<u8>, String> {
    use std::io::Write;
    use std::process::{Command, Stdio};

    let clean: String = raw_text.trim().chars().take(4000).collect();
    if clean.is_empty() {
        return Err("Kein Text zum Vorlesen.".into());
    }
    let piper = bundled_piper().ok_or("Neural-TTS-Engine ist nicht installiert.")?;
    let (onnx, cfg) = voice_files(voice_id).ok_or_else(|| format!("Stimme {voice_id} ist nicht installiert."))?;

    let cdir = cache_dir();
    std::fs::create_dir_all(&cdir).map_err(|e| e.to_string())?;
    let key = cache_key(voice_id, &clean);
    let cached = cdir.join(format!("{key}.wav"));
    if let Ok(bytes) = std::fs::read(&cached) {
        if bytes.len() > 44 && &bytes[..4] == b"RIFF" {
            return Ok(bytes);
        }
    }

    let tmp_wav = cdir.join(format!("{key}.{}.tmp.wav", uuid::Uuid::new_v4().simple()));
    let bin_dir = piper.parent().unwrap_or_else(|| Path::new("."));

    let mut cmd = Command::new(&piper);
    cmd.arg("--model")
        .arg(&onnx)
        .arg("--config")
        .arg(&cfg)
        .arg("--sentence_silence")
        .arg("0.22")
        .arg("--output_file")
        .arg(&tmp_wav)
        .current_dir(bin_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());

    let espeak = bin_dir.join("espeak-ng-data");
    if espeak.is_dir() {
        cmd.arg("--espeak_data").arg(&espeak);
    }

    #[cfg(target_os = "macos")]
    {
        cmd.env("DYLD_LIBRARY_PATH", bin_dir);
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        cmd.env("LD_LIBRARY_PATH", bin_dir);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }

    let mut child = cmd.spawn().map_err(|e| format!("Piper konnte nicht gestartet werden: {e}"))?;
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(clean.as_bytes());
        let _ = stdin.write_all(b"\n");
    }

    // Wait up to 25 seconds so synthesis never blocks indefinitely
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(25);
    let status = loop {
        match child.try_wait() {
            Ok(Some(st)) => break st,
            Ok(None) => {
                if std::time::Instant::now() >= deadline {
                    let _ = child.kill();
                    let _ = child.wait();
                    let _ = std::fs::remove_file(&tmp_wav);
                    return Err("Sprachausgabe hat zu lange gedauert.".into());
                }
                std::thread::sleep(std::time::Duration::from_millis(25));
            }
            Err(e) => {
                let _ = std::fs::remove_file(&tmp_wav);
                return Err(e.to_string());
            }
        }
    };

    if !status.success() {
        let mut err = String::new();
        if let Some(mut se) = child.stderr.take() {
            use std::io::Read;
            let _ = se.read_to_string(&mut err);
        }
        let _ = std::fs::remove_file(&tmp_wav);
        return Err(format!("Piper-Fehler: {}", err.trim()));
    }

    let bytes = std::fs::read(&tmp_wav).map_err(|e| format!("WAV-Datei konnte nicht gelesen werden: {e}"))?;
    let _ = std::fs::rename(&tmp_wav, &cached);
    let _ = std::fs::remove_file(&tmp_wav);
    prune_cache(&cdir);

    if bytes.len() <= 44 {
        return Err("Keine Audiodaten erzeugt.".into());
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn platform_assets_cover_desktop_and_reject_mobile() {
        assert_eq!(platform_asset("windows", "x86_64").unwrap().0, "piper_windows_amd64.zip");
        assert_eq!(platform_asset("macos", "aarch64").unwrap().0, "piper_macos_aarch64.tar.gz");
        assert_eq!(platform_asset("macos", "x86_64").unwrap().0, "piper_macos_x64.tar.gz");
        assert_eq!(platform_asset("linux", "x86_64").unwrap().0, "piper_linux_x86_64.tar.gz");
        assert_eq!(platform_asset("linux", "aarch64").unwrap().0, "piper_linux_aarch64.tar.gz");
        assert!(platform_asset("android", "aarch64").is_err());
    }

    #[test]
    fn catalog_voices_are_unique_and_pinned_to_v1() {
        let mut ids = std::collections::HashSet::new();
        for v in CATALOG {
            assert!(ids.insert(v.id), "duplicate voice {}", v.id);
            let (onnx, cfg) = voice_urls(v);
            assert!(onnx.starts_with("https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/"));
            assert!(onnx.ends_with(".onnx"));
            assert!(cfg.ends_with(".onnx.json"));
            assert!(["de", "en", "fr", "es", "it"].contains(&v.lang));
        }
        assert!(CATALOG.len() >= 8);
    }

    #[test]
    fn finds_piper_binary_in_nested_folder() {
        let dir = std::env::temp_dir().join(format!("merkora-piper-test-{}", std::process::id()));
        let sub = dir.join("piper");
        std::fs::create_dir_all(&sub).unwrap();
        let exe = sub.join(if cfg!(windows) { "piper.exe" } else { "piper" });
        std::fs::write(&exe, b"").unwrap();
        assert_eq!(find_piper(&dir, 0), Some(exe));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn cache_key_is_stable_and_distinct() {
        let a = cache_key("de_DE-thorsten-medium", "Hallo Welt");
        let b = cache_key("de_DE-thorsten-medium", "Hallo Welt");
        let c = cache_key("en_US-amy-medium", "Hallo Welt");
        assert_eq!(a, b);
        assert_ne!(a, c);
        assert_eq!(a.len(), 40);
    }
}
