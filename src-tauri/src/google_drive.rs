use reqwest::multipart;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::time::Duration;
use tokio::time::sleep;

const GOOGLE_DOCS_MIME_TYPE: &str = "application/vnd.google-apps.document";

#[derive(Debug, Serialize)]
pub struct UploadResult {
    #[serde(rename = "fileId")]
    pub file_id: String,
}

#[derive(Debug, Serialize)]
pub struct ExportResult {
    pub text: String,
}

#[derive(Debug, Deserialize)]
struct DriveFile {
    id: String,
}

/// Upload a file to Google Drive as a Google Document (triggers OCR)
#[tauri::command]
pub async fn upload_to_google_drive(
    file_path: String,
    access_token: String,
) -> Result<UploadResult, String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err(format!("File not found: {}", file_path));
    }

    let file_content = fs::read(&file_path).map_err(|e| e.to_string())?;
    let file_name = uuid::Uuid::new_v4().to_string();

    // Determine MIME type from extension
    let mime_type = match path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "pdf" => "application/pdf",
        _ => "application/octet-stream",
    };

    execute_with_retry(|| async {
        let client = reqwest::Client::new();

        // Create metadata
        let metadata = serde_json::json!({
            "name": file_name,
            "mimeType": GOOGLE_DOCS_MIME_TYPE
        });

        let metadata_part = multipart::Part::text(metadata.to_string())
            .mime_str("application/json")
            .map_err(|e| e.to_string())?;

        let file_part = multipart::Part::bytes(file_content.clone())
            .mime_str(mime_type)
            .map_err(|e| e.to_string())?;

        let form = multipart::Form::new()
            .part("metadata", metadata_part)
            .part("file", file_part);

        let response = client
            .post("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id")
            .bearer_auth(&access_token)
            .multipart(form)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!("Upload failed ({}): {}", status, text));
        }

        let drive_file: DriveFile = response.json().await.map_err(|e| e.to_string())?;

        Ok(UploadResult {
            file_id: drive_file.id,
        })
    })
    .await
}

/// Export a Google Document as plain text
#[tauri::command]
pub async fn export_google_doc_as_text(
    file_id: String,
    access_token: String,
) -> Result<ExportResult, String> {
    execute_with_retry(|| async {
        let client = reqwest::Client::new();

        let url = format!(
            "https://www.googleapis.com/drive/v3/files/{}/export?mimeType=text/plain",
            file_id
        );

        let response = client
            .get(&url)
            .bearer_auth(&access_token)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!("Export failed ({}): {}", status, text));
        }

        let text = response.text().await.map_err(|e| e.to_string())?;

        Ok(ExportResult { text })
    })
    .await
}

/// Delete a file from Google Drive
#[tauri::command]
pub async fn delete_google_drive_file(
    file_id: String,
    access_token: String,
) -> Result<(), String> {
    execute_with_retry(|| async {
        let client = reqwest::Client::new();

        let url = format!("https://www.googleapis.com/drive/v3/files/{}", file_id);

        let response = client
            .delete(&url)
            .bearer_auth(&access_token)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        // 204 No Content is success for delete
        if !response.status().is_success() && response.status() != reqwest::StatusCode::NO_CONTENT {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!("Delete failed ({}): {}", status, text));
        }

        Ok(())
    })
    .await
}

/// Execute a function with exponential backoff retry for transient errors
async fn execute_with_retry<F, Fut, T>(f: F) -> Result<T, String>
where
    F: Fn() -> Fut,
    Fut: std::future::Future<Output = Result<T, String>>,
{
    let mut retries = 0u32;
    let max_retries = 10;

    loop {
        match f().await {
            Ok(result) => return Ok(result),
            Err(e) => {
                // Check if error is retriable (rate limit, timeout, server error)
                let is_retriable = e.contains("429")
                    || e.contains("500")
                    || e.contains("502")
                    || e.contains("503")
                    || e.contains("504")
                    || e.contains("timeout")
                    || e.contains("Timeout");

                if !is_retriable || retries >= max_retries {
                    return Err(e);
                }

                // Exponential backoff with jitter
                let delay_secs = (1.5_f64.powi(retries as i32)).min(15.0);
                let jitter = rand::random::<f64>(); // 0.0 to 1.0
                let delay = Duration::from_secs_f64(delay_secs + jitter);

                sleep(delay).await;
                retries += 1;
            }
        }
    }
}

// Simple random for jitter (avoiding external crate)
mod rand {
    use std::time::{SystemTime, UNIX_EPOCH};

    pub fn random<T>() -> f64 {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .subsec_nanos();
        (nanos as f64 % 1000.0) / 1000.0
    }
}
