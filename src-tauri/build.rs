// The window shows the app from http://localhost:<port>; Tauri only lets such pages call the app's own
// commands when they are listed here and allowed in capabilities/default.json.
const COMMANDS: &[&str] = &[
    "load_data",
    "save_data",
    "save_data_now",
    "data_folder",
    "open_data_folder",
    "open_external",
    "media_put",
    "media_get",
    "media_type",
    "media_keys",
    "media_delete",
    "import_apkg",
    "import_apkg_path",
    "take_open_files",
    "http_fetch",
    "smoke_info",
    "smoke_done",
    "save_download",
    "export_apkg",
];

fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)))
        .expect("failed to run tauri-build");
}
