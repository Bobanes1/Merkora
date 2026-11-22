//! Built-in Java: Merkora downloads an official JDK (Eclipse Temurin 21 from adoptium.net) into its own
//! data folder – no admin rights, no change to the system PATH, removable at any time.
//! The archive is checked against Adoptium's SHA-256 checksum before it is unpacked.

use serde::Serialize;
use std::path::{Path, PathBuf};

/// Adoptium's API: the newest Temurin 21 (long-term support) for this computer.
const API: &str = "https://api.adoptium.net/v3/assets/latest/21/hotspot";
/// Only Adoptium's own release downloads are accepted.
const ALLOWED: &str = "https://github.com/adoptium/";

/// Folder of the built-in JDK (inside Merkora's data folder – the same one the learning data uses,
/// e.g. %APPDATA%\Merkora on Windows; MERKORA_DATA_DIR overrides it).
pub fn jdk_root() -> Option<PathBuf> {
    Some(crate::storage::data_dir().join("java"))
}

/// java(.exe) of the built-in JDK, if it is installed.
pub fn bundled_java() -> Option<PathBuf> {
    find_java(&jdk_root()?, 0)
}

/// Finds bin/java(.exe) in an unpacked JDK (Windows/Linux: jdk-21…/bin, macOS: jdk-21…/Contents/Home/bin).
pub fn find_java(dir: &Path, depth: u32) -> Option<PathBuf> {
    let exe = if cfg!(windows) { "java.exe" } else { "java" };
    let here = dir.join("bin").join(exe);
    if here.is_file() {
        return Some(here);
    }
    if depth >= 4 {
        return None;
    }
    let mut dirs: Vec<PathBuf> = std::fs::read_dir(dir).ok()?.flatten().map(|e| e.path()).filter(|p| p.is_dir()).collect();
    dirs.sort();
    dirs.iter().find_map(|p| find_java(p, depth + 1))
}

/// Adoptium's names for this operating system and processor.
pub fn platform(os: &str, arch: &str) -> Result<(&'static str, &'static str), String> {
    let o = match os {
        "windows" => "windows",
        "macos" => "mac",
        "linux" => "linux",
        _ => return Err("Für dieses System gibt es kein eingebautes Java.".into()),
    };
    let a = match arch {
        "x86_64" => "x64",
        "aarch64" => "aarch64",
        _ => return Err("Für diesen Prozessor gibt es kein eingebautes Java.".into()),
    };
    Ok((o, a))
}

#[derive(Serialize, Clone)]
pub struct JavaOffer {
    pub version: String,
    /// Download size in bytes.
    pub size: u64,
    #[serde(skip)]
    pub link: String,
    #[serde(skip)]
    pub checksum: String,
    #[serde(skip)]
    pub name: String,
}

/// Reads the API answer (pure – tested).
pub fn parse_offer(json: &str) -> Result<JavaOffer, String> {
    let v: serde_json::Value = serde_json::from_str(json).map_err(|_| "Unerwartete Antwort von adoptium.net.".to_string())?;
    let a = v.get(0).ok_or("Kein passendes Java gefunden.")?;
    let pkg = &a["binary"]["package"];
    let link = pkg["link"].as_str().unwrap_or_default().to_string();
    let checksum = pkg["checksum"].as_str().unwrap_or_default().to_lowercase();
    let name = pkg["name"].as_str().unwrap_or_default().to_string();
    if !link.starts_with(ALLOWED) || link.contains("..") || checksum.len() != 64 || !(name.ends_with(".zip") || name.ends_with(".tar.gz")) {
        return Err("Die Download-Angaben von adoptium.net sehen nicht wie erwartet aus.".into());
    }
    Ok(JavaOffer {
        version: a["version"]["openjdk_version"].as_str().or(a["release_name"].as_str()).unwrap_or("21").to_string(),
        size: pkg["size"].as_u64().unwrap_or(0),
        link,
        checksum,
        name,
    })
}

pub async fn offer(client: &reqwest::Client) -> Result<JavaOffer, String> {
    let (os, arch) = platform(std::env::consts::OS, std::env::consts::ARCH)?;
    let url = format!("{API}?architecture={arch}&image_type=jdk&os={os}&vendor=eclipse");
    let res = client.get(&url).send().await.map_err(|e| format!("adoptium.net ist nicht erreichbar: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("adoptium.net antwortet nicht ({}).", res.status()));
    }
    parse_offer(&res.text().await.map_err(|e| e.to_string())?)
}

/// Unpacks the checked archive into `dest` (zip on Windows, tar.gz on macOS/Linux).
pub fn unpack(archive: &Path, name: &str, dest: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    let file = std::fs::File::open(archive).map_err(|e| e.to_string())?;
    if name.ends_with(".zip") {
        let mut zip = zip::ZipArchive::new(file).map_err(|e| format!("Archiv beschädigt: {e}"))?;
        zip.extract(dest).map_err(|e| format!("Entpacken fehlgeschlagen: {e}"))?;
    } else {
        #[cfg(desktop)]
        {
            let gz = flate2::read::GzDecoder::new(std::io::BufReader::new(file));
            tar::Archive::new(gz).unpack(dest).map_err(|e| format!("Entpacken fehlgeschlagen: {e}"))?;
        }
        #[cfg(mobile)]
        {
            let _ = file;
            return Err("Auf dem Handy gibt es kein eingebautes Java.".into());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn platform_names() {
        assert_eq!(platform("windows", "x86_64").unwrap(), ("windows", "x64"));
        assert_eq!(platform("macos", "aarch64").unwrap(), ("mac", "aarch64"));
        assert!(platform("android", "aarch64").is_err());
    }

    #[test]
    fn offer_only_from_adoptium() {
        let good = r#"[{"binary":{"package":{"link":"https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.5%2B11/OpenJDK21U-jdk_x64_windows_hotspot_21.0.5_11.zip","checksum":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","size":191000000,"name":"OpenJDK21U-jdk_x64_windows_hotspot_21.0.5_11.zip"}},"version":{"openjdk_version":"21.0.5+11-LTS"}}]"#;
        let o = parse_offer(good).unwrap();
        assert_eq!(o.version, "21.0.5+11-LTS");
        assert_eq!(o.size, 191000000);
        assert_eq!(o.checksum.len(), 64);
        let evil = good.replace("https://github.com/adoptium/", "https://example.com/");
        assert!(parse_offer(&evil).is_err());
        assert!(parse_offer("[]").is_err());
    }

    /// The desktop app never sets MERKORA_DATA_DIR – the JDK folder must still be found (it was not: „Kein Datenordner gefunden“).
    #[test]
    fn jdk_folder_without_env_var() {
        if std::env::var_os("MERKORA_DATA_DIR").is_some() {
            return;
        }
        let root = jdk_root().expect("jdk folder");
        assert!(root.ends_with("java"));
        assert_eq!(root.parent().unwrap(), crate::storage::data_dir());
    }

    #[test]
    fn finds_java_in_unpacked_folder() {
        let dir = std::env::temp_dir().join(format!("merkora-jdk-test-{}", std::process::id()));
        let bin = dir.join("jdk-21").join("Contents").join("Home").join("bin");
        std::fs::create_dir_all(&bin).unwrap();
        let exe = bin.join(if cfg!(windows) { "java.exe" } else { "java" });
        std::fs::write(&exe, b"").unwrap();
        assert_eq!(find_java(&dir, 0), Some(exe));
        let _ = std::fs::remove_dir_all(&dir);
    }
}

/// How often a broken download is picked up again before giving up.
#[cfg(desktop)]
const RETRIES: u32 = 5;

/// For the ≈ 200 MB archive: no overall time limit (on a slow line the download may take long),
/// but it gives up when nothing arrives for a minute; no gzip, so the bytes on disk are exactly the file.
#[cfg(desktop)]
static DOWNLOAD: once_cell::sync::Lazy<reqwest::Client> = once_cell::sync::Lazy::new(|| {
    reqwest::Client::builder()
        .user_agent(concat!("Merkora/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(std::time::Duration::from_secs(20))
        .read_timeout(std::time::Duration::from_secs(60))
        .no_gzip()
        .build()
        .expect("http client")
});

/// Downloads `url` into `file`. When the connection breaks, it asks for the rest (`Range`) and goes on
/// where it stopped – up to `retries` times; a server that ignores `Range` sends everything again, then
/// the file starts over. `on_progress` gets the bytes in the file so far. Returns the size.
#[cfg(desktop)]
pub(crate) async fn download_resumable(
    client: &reqwest::Client,
    url: &str,
    file: &mut std::fs::File,
    retries: u32,
    mut on_progress: impl FnMut(u64),
) -> Result<u64, String> {
    use std::io::{Seek, SeekFrom, Write};
    let mut got = 0u64;
    let mut failures = 0u32;
    let mut total: Option<u64> = None;
    loop {
        let mut req = client.get(url);
        if got > 0 {
            req = req.header(reqwest::header::RANGE, format!("bytes={got}-"));
        }
        let broke: String = 'attempt: {
            let mut res = match req.send().await {
                Ok(r) => r,
                Err(e) => break 'attempt e.to_string(),
            };
            let status = res.status();
            if got > 0 && status == reqwest::StatusCode::PARTIAL_CONTENT {
                // the rest comes – carry on
            } else if status.is_success() {
                if got > 0 {
                    // the server sends the whole file again
                    file.set_len(0).map_err(|e| e.to_string())?;
                    file.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
                    got = 0;
                }
                total = res.content_length();
            } else if status.is_server_error() || status == reqwest::StatusCode::RANGE_NOT_SATISFIABLE {
                break 'attempt format!("Server antwortet mit {status}");
            } else {
                return Err(format!("Download fehlgeschlagen ({status})."));
            }
            loop {
                match res.chunk().await {
                    Ok(Some(c)) => {
                        file.write_all(&c).map_err(|e| e.to_string())?;
                        got += c.len() as u64;
                        on_progress(got);
                    }
                    Ok(None) => {
                        if total.is_some_and(|t| got < t) {
                            break 'attempt "Verbindung vorzeitig beendet".to_string();
                        }
                        file.flush().map_err(|e| e.to_string())?;
                        return Ok(got);
                    }
                    Err(e) => break 'attempt e.to_string(),
                }
            }
        };
        failures += 1;
        if failures > retries {
            let mb = |b: u64| b as f64 / 1_000_000.0;
            let at = match total {
                Some(t) => format!("bei {:.0} von {:.0} MB", mb(got), mb(t)),
                None => format!("bei {:.0} MB", mb(got)),
            };
            return Err(format!("Die Verbindung ist mehrmals abgebrochen ({at}). Bitte prüfe dein Internet und versuche es nochmal. ({broke})"));
        }
        let wait = std::time::Duration::from_millis(if cfg!(test) { 10 } else { 2000 * failures as u64 });
        let _ = tauri::async_runtime::spawn_blocking(move || std::thread::sleep(wait)).await;
    }
}

/// Downloads Java, checks the SHA-256 checksum, unpacks it next to the old one and swaps it in.
/// `progress` gets 0–0.9 while downloading, then 0.92 (unpacking) and 1.0.
#[cfg(desktop)]
pub async fn install(client: &reqwest::Client, progress: impl Fn(f64)) -> Result<(), String> {
    use sha2::Digest;
    let o = offer(client).await?;
    let root = jdk_root().ok_or("Kein Datenordner gefunden.")?;
    let parent = root.parent().ok_or("Kein Datenordner gefunden.")?.to_path_buf();
    std::fs::create_dir_all(&parent).map_err(|e| e.to_string())?;
    let _ = client; // the archive goes through DOWNLOAD (no overall time limit), see there
    let archive = parent.join(format!("java-download-{}", o.name));
    progress(0.0);
    let total = o.size;
    let mut file = std::fs::File::create(&archive).map_err(|e| e.to_string())?;
    let mut last = 0u64;
    let r = download_resumable(&DOWNLOAD, &o.link, &mut file, RETRIES, |got| {
        if total > 0 && got.abs_diff(last) * 100 >= total {
            last = got;
            progress(0.9 * (got.min(total)) as f64 / total as f64);
        }
    })
    .await;
    drop(file);
    if let Err(e) = r {
        let _ = std::fs::remove_file(&archive);
        return Err(e);
    }
    // checked from the file: after a resumed download the parts come from several connections
    let path = archive.clone();
    let digest = tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        let mut f = std::fs::File::open(&path).map_err(|e| e.to_string())?;
        let mut hash = sha2::Sha256::new();
        std::io::copy(&mut f, &mut hash).map_err(|e| e.to_string())?;
        Ok(format!("{:x}", hash.finalize()))
    })
    .await
    .map_err(|e| e.to_string())??;
    if digest != o.checksum {
        let _ = std::fs::remove_file(&archive);
        return Err("Die Prüfsumme stimmt nicht – der Download ist beschädigt. Bitte nochmal versuchen.".into());
    }
    progress(0.92);
    let name = o.name.clone();
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let fresh = parent.join("java-new");
        let _ = std::fs::remove_dir_all(&fresh);
        let r = unpack(&archive, &name, &fresh);
        let _ = std::fs::remove_file(&archive);
        r?;
        if find_java(&fresh, 0).is_none() {
            let _ = std::fs::remove_dir_all(&fresh);
            return Err("Im Download wurde kein Java gefunden.".into());
        }
        let _ = std::fs::remove_dir_all(&root);
        std::fs::rename(&fresh, &root).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())??;
    progress(1.0);
    Ok(())
}

/// The download picks up again after a broken connection – tested against a tiny local server.
#[cfg(all(test, desktop))]
mod resume_tests {
    use std::io::{Read, Write};
    use std::net::TcpListener;

    /// Serves `answers` one connection after another: (cut the body after n bytes, honour Range?).
    fn server(body: Vec<u8>, answers: Vec<(Option<usize>, bool)>) -> (String, std::thread::JoinHandle<Vec<String>>) {
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/jdk.zip", l.local_addr().unwrap());
        let h = std::thread::spawn(move || {
            let mut ranges = vec![];
            for (cut, honour) in answers {
                let (mut s, _) = l.accept().unwrap();
                let mut buf = [0u8; 4096];
                let n = s.read(&mut buf).unwrap();
                let req = String::from_utf8_lossy(&buf[..n]).to_lowercase();
                let from = req
                    .lines()
                    .find_map(|l| l.strip_prefix("range: bytes="))
                    .and_then(|r| r.trim_end_matches('-').trim().parse::<usize>().ok());
                ranges.push(from.map(|f| f.to_string()).unwrap_or_else(|| "-".into()));
                let (status, part) = match from {
                    Some(f) if honour => (format!("206 Partial Content\r\nContent-Range: bytes {f}-{}/{}", body.len() - 1, body.len()), &body[f..]),
                    _ => ("200 OK".to_string(), &body[..]),
                };
                let head = format!("HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", part.len());
                s.write_all(head.as_bytes()).unwrap();
                let send = cut.map_or(part.len(), |c| c.min(part.len()));
                let _ = s.write_all(&part[..send]);
                let _ = s.flush();
                // dropping the socket here breaks the connection mid-body when cut
            }
            ranges
        });
        (url, h)
    }

    fn run(url: &str, retries: u32) -> (Result<u64, String>, Vec<u8>) {
        let path = std::env::temp_dir().join(format!("merkora-resume-{}-{}", std::process::id(), url.rsplit(':').next().unwrap_or("x").replace('/', "_")));
        let client = reqwest::Client::builder().no_gzip().build().unwrap();
        let mut f = std::fs::File::create(&path).unwrap();
        let r = tauri::async_runtime::block_on(super::download_resumable(&client, url, &mut f, retries, |_| {}));
        drop(f);
        let data = std::fs::read(&path).unwrap_or_default();
        let _ = std::fs::remove_file(&path);
        (r, data)
    }

    fn body() -> Vec<u8> {
        (0..200_000u32).map(|i| (i * 7 % 251) as u8).collect()
    }

    #[test]
    fn resumes_after_broken_connection() {
        let b = body();
        let (url, h) = server(b.clone(), vec![(Some(70_000), true), (Some(50_000), true), (None, true)]);
        let (r, data) = run(&url, 5);
        assert_eq!(r.unwrap(), b.len() as u64);
        assert!(data == b, "file differs");
        let ranges = h.join().unwrap();
        assert_eq!(ranges[0], "-");
        assert_ne!(ranges[1], "-", "second request asks for the rest");
    }

    #[test]
    fn starts_over_when_range_is_ignored() {
        let b = body();
        let (url, h) = server(b.clone(), vec![(Some(90_000), false), (None, false)]);
        let (r, data) = run(&url, 5);
        assert_eq!(r.unwrap(), b.len() as u64);
        assert!(data == b, "file differs");
        h.join().unwrap();
    }

    #[test]
    fn gives_up_with_a_clear_message() {
        let b = body();
        let (url, _h) = server(b, vec![(Some(10_000), true), (Some(10_000), true), (Some(10_000), true)]);
        let (r, _) = run(&url, 2);
        let e = r.unwrap_err();
        assert!(e.contains("mehrmals abgebrochen") && e.contains("MB"), "{e}");
    }
}

/// Real download (≈ 200 MB) into a temp folder, then `java -version`. Run with: cargo test --lib real_java_install -- --ignored
#[cfg(all(test, desktop))]
mod net_tests {
    #[test]
    #[ignore]
    fn real_java_install() {
        let dir = std::env::temp_dir().join(format!("merkora-java-install-{}", std::process::id()));
        std::env::set_var("MERKORA_DATA_DIR", &dir);
        tauri::async_runtime::block_on(super::install(&crate::CLIENT, |p| eprintln!("progress {:.0} %", p * 100.0))).unwrap();
        let java = super::bundled_java().expect("java installed");
        let out = std::process::Command::new(&java).arg("-version").output().unwrap();
        let text = String::from_utf8_lossy(&out.stderr).to_string();
        eprintln!("{text}");
        assert!(text.contains("21."));
        // a real program in the single-file launcher, like Merkora runs it
        let src = dir.join("MerkoraTest.java");
        std::fs::write(&src, "class MerkoraTest { public static void main(String[] a) { System.out.println(6 * 7); } }").unwrap();
        let run = std::process::Command::new(&java).arg("MerkoraTest.java").current_dir(&dir).output().unwrap();
        assert_eq!(String::from_utf8_lossy(&run.stdout).trim(), "42");
        let _ = std::fs::remove_dir_all(&dir);
    }
}

/// Every command the app registers must also be allowed for the window (build.rs list + desktop capabilities),
/// otherwise it fails at runtime with „not allowed by ACL“.
#[cfg(test)]
mod acl_tests {
    #[test]
    fn every_command_is_allowed() {
        let lib = include_str!("lib.rs");
        let build = include_str!("../build.rs");
        let caps = include_str!("../capabilities/default.json");
        let start = lib.find("generate_handler![").expect("handler list") + "generate_handler![".len();
        let list = &lib[start..start + lib[start..].find(']').unwrap()];
        let names: Vec<&str> = list.split(',').map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
        assert!(names.len() > 20);
        for n in names {
            let n = n.rsplit("::").next().unwrap();
            assert!(build.contains(&format!("\"{n}\"")), "{n} fehlt in build.rs");
            assert!(caps.contains(&format!("\"allow-{}\"", n.replace('_', "-"))), "allow-{n} fehlt in capabilities/default.json");
        }
    }
}
