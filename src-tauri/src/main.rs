// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::Manager;

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileEntryDto {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub size: Option<u64>,
    pub updated_at: Option<String>,
}

#[tauri::command]
fn get_app_data_dir(app: tauri::AppHandle) -> Result<String, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.to_string_lossy().replace('\\', "/"))
        .map_err(|e| e.to_string())
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

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {}", path, e))
}

#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    let p = Path::new(&path);
    if let Some(parent) = p.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    fs::write(p, contents).map_err(|e| format!("Failed to write {}: {}", path, e))
}

#[tauri::command]
fn read_binary_file(path: String) -> Result<Vec<u8>, String> {
    fs::read(&path).map_err(|e| format!("Failed to read binary {}: {}", path, e))
}

#[tauri::command]
fn write_binary_file(path: String, contents: Vec<u8>) -> Result<(), String> {
    let p = Path::new(&path);
    if let Some(parent) = p.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    fs::write(p, contents).map_err(|e| format!("Failed to write binary {}: {}", path, e))
}

#[tauri::command]
fn file_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[tauri::command]
fn create_dir_all(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| format!("Failed to create directory {}: {}", path, e))
}

#[tauri::command]
fn rename_file(old_path: String, new_path: String) -> Result<(), String> {
    fs::rename(&old_path, &new_path).map_err(|e| format!("Failed to rename {} to {}: {}", old_path, new_path, e))
}

#[tauri::command]
fn remove_file(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.is_dir() {
        fs::remove_dir_all(p).map_err(|e| format!("Failed to remove dir {}: {}", path, e))
    } else {
        fs::remove_file(p).map_err(|e| format!("Failed to remove file {}: {}", path, e))
    }
}

#[tauri::command]
fn trash_document_file(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("File does not exist: {}", path));
    }
    trash::delete(p).map_err(|e| format!("Failed to move {} to Recycle Bin: {}", path, e))
}

#[tauri::command]
fn read_dir_entries(path: String) -> Result<Vec<FileEntryDto>, String> {
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
fn get_cli_open_file() -> Option<String> {
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
            return Some(p.to_string_lossy().replace('\\', "/"));
        }
    }
    None
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            get_app_data_dir,
            get_default_documents_dir,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running gedankenfaden application");
}
