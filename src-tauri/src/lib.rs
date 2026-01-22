mod auth;
mod google_drive;
mod pdf;

use auth::{
    clear_auth_tokens, get_user_info, load_stored_tokens, refresh_access_token, start_oauth_flow,
};
use google_drive::{delete_google_drive_file, export_google_doc_as_text, upload_to_google_drive};
use pdf::{cleanup_temp_dir, extract_pdf_page, get_pdf_page_count, split_pdf, write_binary_file};

/// Open a folder in the system file manager
#[tauri::command]
async fn open_folder(path: String) -> Result<(), String> {
    open::that(&path).map_err(|e| format!("Failed to open folder: {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            // Auth commands
            start_oauth_flow,
            refresh_access_token,
            load_stored_tokens,
            clear_auth_tokens,
            get_user_info,
            // Google Drive commands
            upload_to_google_drive,
            export_google_doc_as_text,
            delete_google_drive_file,
            // PDF commands
            get_pdf_page_count,
            split_pdf,
            extract_pdf_page,
            cleanup_temp_dir,
            write_binary_file,
            // Utility commands
            open_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[ignore] // Requires GUI environment, hangs on Windows CI
    async fn test_open_folder_with_valid_temp_dir() {
        let temp_dir = tempfile::tempdir().unwrap();
        let path = temp_dir.path().to_string_lossy().to_string();
        let result = open_folder(path).await;
        match result {
            Ok(()) => {}
            Err(e) => {
                assert!(e.contains("Failed to open folder"));
            }
        }
    }

    #[tokio::test]
    #[ignore] // Requires GUI environment, hangs on Windows CI
    async fn test_open_folder_nonexistent_path() {
        let result = open_folder("/nonexistent/path/that/should/not/exist/12345".to_string()).await;
        let _ = result;
    }

    #[tokio::test]
    #[ignore] // Requires GUI environment, hangs on Windows CI
    async fn test_open_folder_with_file_path() {
        let temp_file = tempfile::NamedTempFile::new().unwrap();
        let path = temp_file.path().to_string_lossy().to_string();
        let result = open_folder(path).await;
        let _ = result;
    }
}
