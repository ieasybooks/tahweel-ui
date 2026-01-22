mod auth;
mod google_drive;
mod pdf;

use auth::{clear_auth_tokens, get_user_info, load_stored_tokens, refresh_access_token, start_oauth_flow};
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
    async fn test_open_folder_with_valid_temp_dir() {
        // Create a temporary directory
        let temp_dir = tempfile::tempdir().unwrap();
        let path = temp_dir.path().to_string_lossy().to_string();

        // This will attempt to open the folder
        // On CI/headless systems it may fail, but the error message should be meaningful
        let result = open_folder(path).await;

        // We can't guarantee success on all systems (headless servers, CI)
        // but we verify the function executes without panic
        // In a GUI environment this would open the file manager
        match result {
            Ok(()) => {
                // Success - folder was opened (or open::that succeeded)
            }
            Err(e) => {
                // Expected on headless systems - verify error format
                assert!(e.contains("Failed to open folder"));
            }
        }
    }

    #[tokio::test]
    async fn test_open_folder_nonexistent_path() {
        // Test with a path that definitely doesn't exist
        let result = open_folder("/nonexistent/path/that/should/not/exist/12345".to_string()).await;

        // Behavior varies by OS:
        // - Some OS will return an error
        // - Some OS (like macOS) may succeed but show an error dialog
        // We just verify no panic occurs
        let _ = result;
    }

    #[tokio::test]
    async fn test_open_folder_with_file_path() {
        // Create a temporary file (not a directory)
        let temp_file = tempfile::NamedTempFile::new().unwrap();
        let path = temp_file.path().to_string_lossy().to_string();

        // Attempting to "open folder" on a file
        let result = open_folder(path).await;

        // On most systems, open::that on a file will open it with the default app
        // We just verify no panic
        let _ = result;
    }
}
