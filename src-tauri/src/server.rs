//! Serves the bundled app on http://localhost:<port> (only reachable from this computer).
//! A fixed address keeps the sign-in return addresses for Dropbox/Google sync the same as before.

use std::sync::Arc;
use tauri::{AppHandle, Runtime};

pub const PORT: u16 = 47318;

fn serve<R: Runtime>(app: AppHandle<R>, server: Arc<tiny_http::Server>) {
    for mut req in server.incoming_requests() {
        let raw = req.url().split(['?', '#']).next().unwrap_or("/").to_string();
        // Diagnostics of the self-test (only while MERKORA_SMOKE is set).
        if raw == "/__smoke-log" {
            if let Ok(file) = std::env::var("MERKORA_SMOKE") {
                let mut body = String::new();
                let _ = std::io::Read::read_to_string(req.as_reader(), &mut body);
                use std::io::Write;
                if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(format!("{file}.log")) {
                    let _ = writeln!(f, "{body}");
                }
            }
            let _ = req.respond(tiny_http::Response::empty(204));
            continue;
        }
        let path = percent_encoding::percent_decode_str(raw.trim_start_matches('/')).decode_utf8_lossy().into_owned();
        let resolver = app.asset_resolver();
        let looks_like_file = path.rsplit('/').next().map(|s| s.contains('.')).unwrap_or(false);
        let asset = if path.is_empty() || path.contains("..") {
            None
        } else {
            resolver.get(path.clone())
        };
        // Routes of the single-page app (e.g. /library/…) get index.html; missing files a 404.
        let asset = asset.or_else(|| if looks_like_file { None } else { resolver.get("index.html".into()) });
        let resp = match asset {
            Some(a) => {
                let mut r = tiny_http::Response::from_data(a.bytes);
                let ext = path.rsplit('.').next().unwrap_or("").to_lowercase();
                let known = match ext.as_str() {
                    "js" | "mjs" => Some("text/javascript"),
                    "css" => Some("text/css"),
                    "json" => Some("application/json"),
                    "webmanifest" => Some("application/manifest+json"),
                    "wasm" => Some("application/wasm"),
                    "svg" => Some("image/svg+xml"),
                    "png" => Some("image/png"),
                    "woff2" => Some("font/woff2"),
                    "woff" => Some("font/woff"),
                    "ttf" => Some("font/ttf"),
                    _ => None,
                };
                let mime_type = known.map(str::to_string).unwrap_or_else(|| a.mime_type.clone());
                let mime = if mime_type.starts_with("text/") && !mime_type.contains("charset") {
                    format!("{mime_type}; charset=utf-8")
                } else {
                    mime_type.clone()
                };
                if let Ok(h) = tiny_http::Header::from_bytes(&b"Content-Type"[..], mime.as_bytes()) {
                    r.add_header(h);
                }
                let cache: &[u8] = if mime_type.contains("html") { b"no-cache" } else { b"max-age=31536000" };
                if let Ok(h) = tiny_http::Header::from_bytes(&b"Cache-Control"[..], cache) {
                    r.add_header(h);
                }
                let _ = req.respond(r);
                continue;
            }
            None => tiny_http::Response::from_string("Nicht gefunden").with_status_code(404),
        };
        let _ = req.respond(resp);
    }
}

/// Starts the server on the fixed port (IPv4 and IPv6, "localhost" can mean either);
/// if something else uses it, the next free port is taken. Returns the port.
pub fn start<R: Runtime>(app: &AppHandle<R>) -> Option<u16> {
    for port in PORT..PORT + 20 {
        let Ok(v4) = tiny_http::Server::http(("127.0.0.1", port)) else { continue };
        let v6 = match tiny_http::Server::http(("::1", port)) {
            Ok(s) => Some(s),
            Err(e) if e.to_string().to_lowercase().contains("in use") || e.to_string().contains("10048") => continue,
            Err(_) => None, // no IPv6 on this machine
        };
        for s in std::iter::once(v4).chain(v6) {
            let s = Arc::new(s);
            for _ in 0..4 {
                let (app, s) = (app.clone(), s.clone());
                std::thread::spawn(move || serve(app, s));
            }
        }
        return Some(port);
    }
    None
}
