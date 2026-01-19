mod auth;
mod google_drive;
mod pdf;

use auth::{clear_auth_tokens, get_user_info, load_stored_tokens, refresh_access_token, start_oauth_flow};
use google_drive::{delete_google_drive_file, export_google_doc_as_text, upload_to_google_drive};
use pdf::{cleanup_temp_dir, extract_pdf_page, get_pdf_page_count, split_pdf, write_binary_file};

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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
