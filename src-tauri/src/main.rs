// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

const LIBRARY_ROOT_MARKER_FILE: &str = "library_root.txt";

/// Normalizes a path string for authorization comparison: forward slashes,
/// no trailing slash, lowercase (Windows filesystem paths are case-insensitive).
fn normalize_path(path: &str) -> String {
    let replaced = path.replace('\\', "/");
    let trimmed = replaced.trim_end_matches('/');
    trimmed.to_lowercase()
}

/// Tracks which filesystem locations the renderer is currently authorized to touch.
///
/// Authorization can only be granted two ways: a location the app owns outright
/// (app data dir, default documents dir), or a path that came back from a native
/// OS file/folder dialog invoked from Rust (`pick_*_dialog` below). The renderer
/// can never grant itself access merely by naming a path.
struct FsAuthState {
    roots: Mutex<Vec<String>>,
    files: Mutex<HashSet<String>>,
}

impl FsAuthState {
    fn new() -> Self {
        Self {
            roots: Mutex::new(Vec::new()),
            files: Mutex::new(HashSet::new()),
        }
    }

    fn add_root(&self, path: &str) {
        let norm = normalize_path(path);
        if norm.is_empty() {
            return;
        }
        let mut roots = self.roots.lock().unwrap();
        if !roots.contains(&norm) {
            roots.push(norm);
        }
    }

    fn add_file(&self, path: &str) {
        let norm = normalize_path(path);
        if norm.is_empty() {
            return;
        }
        self.files.lock().unwrap().insert(norm);
    }

    fn is_authorized(&self, path: &str) -> bool {
        let norm = normalize_path(path);
        if norm.is_empty() {
            return false;
        }
        if self.files.lock().unwrap().contains(&norm) {
            return true;
        }
        let roots = self.roots.lock().unwrap();
        roots
            .iter()
            .any(|root| norm == *root || norm.starts_with(&format!("{}/", root)))
    }
}

fn require_authorized(path: &str, state: &tauri::State<FsAuthState>) -> Result<(), String> {
    if state.is_authorized(path) {
        Ok(())
    } else {
        Err(format!(
            "Access denied: '{}' is outside the app-owned, Library, or dialog-authorized locations",
            path
        ))
    }
}

fn library_root_marker_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(LIBRARY_ROOT_MARKER_FILE)
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileEntryDto {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub size: Option<u64>,
    pub updated_at: Option<String>,
}

fn resolve_app_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Some(test_dir) = std::env::var_os("GEDANKENFADEN_TEST_APP_DATA_DIR") {
        return Ok(PathBuf::from(test_dir));
    }
    app.path().app_data_dir().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_app_data_dir(app: tauri::AppHandle) -> Result<String, String> {
    resolve_app_data_dir(&app).map(|p| p.to_string_lossy().replace('\\', "/"))
}

#[tauri::command]
fn get_default_documents_dir(app: tauri::AppHandle) -> Result<String, String> {
    let docs = app
        .path()
        .document_dir()
        .map_err(|e| e.to_string())?
        .join("Gedankenfaden");
    Ok(docs.to_string_lossy().replace('\\', "/"))
}

/// Returns the last folder authorized as the active Library root via `pick_folder_dialog`,
/// re-authorizing it for this session. Returns `None` if the user has never changed folders.
#[tauri::command]
fn get_persisted_library_root(
    app: tauri::AppHandle,
    state: tauri::State<FsAuthState>,
) -> Result<Option<String>, String> {
    let app_data_dir = resolve_app_data_dir(&app)?;
    let marker = library_root_marker_path(&app_data_dir);
    if !marker.exists() {
        return Ok(None);
    }
    let stored = fs::read_to_string(&marker).map_err(|e| e.to_string())?;
    let trimmed = stored.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    state.add_root(trimmed);
    Ok(Some(trimmed.to_string()))
}

#[tauri::command]
fn read_text_file(path: String, state: tauri::State<FsAuthState>) -> Result<String, String> {
    require_authorized(&path, &state)?;
    fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {}", path, e))
}

#[tauri::command]
fn write_text_file(
    path: String,
    contents: String,
    state: tauri::State<FsAuthState>,
) -> Result<(), String> {
    require_authorized(&path, &state)?;
    let p = Path::new(&path);
    if let Some(parent) = p.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    fs::write(p, contents).map_err(|e| format!("Failed to write {}: {}", path, e))
}

#[tauri::command]
fn read_binary_file(path: String, state: tauri::State<FsAuthState>) -> Result<Vec<u8>, String> {
    require_authorized(&path, &state)?;
    fs::read(&path).map_err(|e| format!("Failed to read binary {}: {}", path, e))
}

#[tauri::command]
fn write_binary_file(
    path: String,
    contents: Vec<u8>,
    state: tauri::State<FsAuthState>,
) -> Result<(), String> {
    require_authorized(&path, &state)?;
    let p = Path::new(&path);
    if let Some(parent) = p.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    fs::write(p, contents).map_err(|e| format!("Failed to write binary {}: {}", path, e))
}

#[tauri::command]
fn file_exists(path: String, state: tauri::State<FsAuthState>) -> bool {
    state.is_authorized(&path) && Path::new(&path).exists()
}

#[tauri::command]
fn create_dir_all(path: String, state: tauri::State<FsAuthState>) -> Result<(), String> {
    require_authorized(&path, &state)?;
    fs::create_dir_all(&path).map_err(|e| format!("Failed to create directory {}: {}", path, e))
}

#[tauri::command]
fn rename_file(
    old_path: String,
    new_path: String,
    state: tauri::State<FsAuthState>,
) -> Result<(), String> {
    require_authorized(&old_path, &state)?;
    require_authorized(&new_path, &state)?;
    fs::rename(&old_path, &new_path)
        .map_err(|e| format!("Failed to rename {} to {}: {}", old_path, new_path, e))
}

#[tauri::command]
fn remove_file(path: String, state: tauri::State<FsAuthState>) -> Result<(), String> {
    require_authorized(&path, &state)?;
    let p = Path::new(&path);
    if p.is_dir() {
        fs::remove_dir_all(p).map_err(|e| format!("Failed to remove dir {}: {}", path, e))
    } else {
        fs::remove_file(p).map_err(|e| format!("Failed to remove file {}: {}", path, e))
    }
}

#[tauri::command]
fn trash_document_file(path: String, state: tauri::State<FsAuthState>) -> Result<(), String> {
    require_authorized(&path, &state)?;
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("File does not exist: {}", path));
    }
    trash::delete(p).map_err(|e| format!("Failed to move {} to Recycle Bin: {}", path, e))
}

#[tauri::command]
fn read_dir_entries(
    path: String,
    state: tauri::State<FsAuthState>,
) -> Result<Vec<FileEntryDto>, String> {
    require_authorized(&path, &state)?;
    let p = Path::new(&path);
    if !p.exists() {
        return Ok(Vec::new());
    }
    let read_dir = fs::read_dir(p).map_err(|e| format!("Failed to read dir {}: {}", path, e))?;
    let mut entries = Vec::new();

    for entry in read_dir {
        if let Ok(entry) = entry {
            let entry_path = entry.path();
            let is_dir = entry_path.is_dir();
            let name = entry.file_name().to_string_lossy().to_string();
            let metadata = entry.metadata().ok();
            let size = metadata.as_ref().map(|m| m.len());
            let updated_at = metadata
                .and_then(|m| m.modified().ok())
                .and_then(|time| {
                    let duration = time.duration_since(std::time::UNIX_EPOCH).ok()?;
                    Some(format!("{}", duration.as_secs()))
                });

            entries.push(FileEntryDto {
                name,
                path: entry_path.to_string_lossy().replace('\\', "/"),
                is_directory: is_dir,
                size,
                updated_at,
            });
        }
    }

    Ok(entries)
}

#[tauri::command]
fn get_cli_open_file(state: tauri::State<FsAuthState>) -> Option<String> {
    for arg in std::env::args().skip(1) {
        let p = Path::new(&arg);
        let lower = arg.to_lowercase();
        if (lower.ends_with(".mflow")
            || lower.ends_with(".json")
            || lower.ends_with(".md")
            || lower.ends_with(".markdown")
            || lower.ends_with(".opml"))
            && p.is_file()
        {
            let normalized = p.to_string_lossy().replace('\\', "/");
            // The OS/shell already authorized this exact path by launching us with it
            // (file association or CLI open) — it did not come from the renderer.
            state.add_file(&normalized);
            return Some(normalized);
        }
    }
    None
}

/// Shows a native folder picker and, if the user selects a folder, authorizes it as
/// the active Library root (recursively) and persists it for future sessions.
#[tauri::command]
fn pick_folder_dialog(
    app: tauri::AppHandle,
    state: tauri::State<FsAuthState>,
) -> Result<Option<String>, String> {
    let selected = app
        .dialog()
        .file()
        .set_title("Select Gedankenfaden Library Folder")
        .blocking_pick_folder();

    let Some(picked) = selected else {
        return Ok(None);
    };
    let path_str = picked.to_string().replace('\\', "/");
    state.add_root(&path_str);

    if let Ok(app_data_dir) = resolve_app_data_dir(&app) {
        let _ = fs::create_dir_all(&app_data_dir);
        let _ = fs::write(library_root_marker_path(&app_data_dir), &path_str);
    }

    Ok(Some(path_str))
}

/// Shows a native open-file dialog for structured import and authorizes exactly the
/// chosen file for reading.
#[tauri::command]
fn pick_document_file_dialog(
    app: tauri::AppHandle,
    state: tauri::State<FsAuthState>,
) -> Result<Option<String>, String> {
    let selected = app
        .dialog()
        .file()
        .set_title("Import Document into Gedankenfaden")
        .add_filter(
            "All Supported Documents (*.mflow, *.json, *.md, *.opml)",
            &["mflow", "json", "md", "markdown", "opml"],
        )
        .add_filter("Gedankenfaden Package (*.mflow)", &["mflow"])
        .add_filter("Canonical JSON (*.json)", &["json"])
        .add_filter("Markdown Document (*.md, *.markdown)", &["md", "markdown"])
        .add_filter("OPML Outline (*.opml)", &["opml"])
        .blocking_pick_file();

    let Some(picked) = selected else {
        return Ok(None);
    };
    let path_str = picked.to_string().replace('\\', "/");
    state.add_file(&path_str);
    Ok(Some(path_str))
}

/// Shows a native save-file dialog for export and authorizes exactly the chosen
/// destination path for writing.
#[tauri::command]
fn pick_export_file_dialog(
    app: tauri::AppHandle,
    state: tauri::State<FsAuthState>,
    suggested_filename: String,
    extension: String,
) -> Result<Option<String>, String> {
    let selected = app
        .dialog()
        .file()
        .set_title("Export Gedankenfaden Document")
        .set_file_name(&suggested_filename)
        .add_filter(format!("{} file", extension.to_uppercase()), &[extension.as_str()])
        .blocking_save_file();

    let Some(picked) = selected else {
        return Ok(None);
    };
    let path_str = picked.to_string().replace('\\', "/");
    state.add_file(&path_str);
    Ok(Some(path_str))
}

#[tauri::command]
fn close_app_window(app: tauri::AppHandle) {
    app.exit(0);
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(FsAuthState::new())
        .setup(|app| {
            let state = app.state::<FsAuthState>();
            if let Ok(app_data_dir) = resolve_app_data_dir(app.handle()) {
                state.add_root(&app_data_dir.to_string_lossy());
            }
            if let Ok(docs_dir) = app.path().document_dir() {
                state.add_root(&docs_dir.join("Gedankenfaden").to_string_lossy());
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_app_data_dir,
            get_default_documents_dir,
            get_persisted_library_root,
            read_text_file,
            write_text_file,
            read_binary_file,
            write_binary_file,
            file_exists,
            create_dir_all,
            rename_file,
            remove_file,
            trash_document_file,
            read_dir_entries,
            get_cli_open_file,
            pick_folder_dialog,
            pick_document_file_dialog,
            pick_export_file_dialog,
            close_app_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running gedankenfaden application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn authorizes_app_owned_roots_recursively() {
        let state = FsAuthState::new();
        state.add_root("C:/Users/test/AppData/Roaming/Gedankenfaden");

        assert!(state.is_authorized("C:/Users/test/AppData/Roaming/Gedankenfaden"));
        assert!(state.is_authorized("C:/Users/test/AppData/Roaming/Gedankenfaden/library.json"));
        assert!(state.is_authorized(
            "c:\\users\\test\\appdata\\roaming\\gedankenfaden\\snapshots_doc1.json"
        ));
    }

    #[test]
    fn authorizes_dialog_selected_library_folder_recursively() {
        let state = FsAuthState::new();
        state.add_root("D:/CustomWorkspaces/MyMaps");

        assert!(state.is_authorized("D:/CustomWorkspaces/MyMaps"));
        assert!(state.is_authorized("D:/CustomWorkspaces/MyMaps/plan.mflow"));
        assert!(state.is_authorized("D:/CustomWorkspaces/MyMaps/plan.mflow.tmp"));
    }

    #[test]
    fn authorizes_exact_dialog_selected_single_files_only() {
        let state = FsAuthState::new();
        state.add_file("E:/Downloads/notes.opml");

        assert!(state.is_authorized("E:/Downloads/notes.opml"));
        // A sibling file in the same directory was never authorized.
        assert!(!state.is_authorized("E:/Downloads/other.opml"));
        assert!(!state.is_authorized("E:/Downloads"));
    }

    #[test]
    fn rejects_arbitrary_renderer_supplied_paths() {
        let state = FsAuthState::new();
        state.add_root("C:/Users/test/AppData/Roaming/Gedankenfaden");
        state.add_root("C:/Users/test/Documents/Gedankenfaden");
        state.add_file("E:/Downloads/notes.opml");

        assert!(!state.is_authorized("C:/Windows/System32/config/SAM"));
        assert!(!state.is_authorized("C:/Users/test/Documents/OtherApp/secrets.txt"));
        // A path that merely shares a prefix with an authorized root is not inside it.
        assert!(!state.is_authorized("C:/Users/test/Documents/GedankenfadenEvilTwin/x.mflow"));
    }

    #[test]
    fn rejects_empty_or_blank_paths() {
        let state = FsAuthState::new();
        state.add_root("C:/Users/test/AppData/Roaming/Gedankenfaden");

        assert!(!state.is_authorized(""));
    }
}
