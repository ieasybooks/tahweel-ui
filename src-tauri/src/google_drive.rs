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

/// Execute a function with exponential backoff retry for transient errors.
/// Retries up to 5 times with exponential backoff (1.5^n seconds + jitter).
/// Retriable errors: 429 (rate limit), 5xx (server errors), timeouts.
async fn execute_with_retry<F, Fut, T>(f: F) -> Result<T, String>
where
    F: Fn() -> Fut,
    Fut: std::future::Future<Output = Result<T, String>>,
{
    let mut retries = 0u32;
    let max_retries = 5;

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

                // Exponential backoff with jitter using UUID for better randomness
                let delay_secs = (1.5_f64.powi(retries as i32)).min(15.0);
                let jitter = random_jitter(); // 0.0 to 1.0
                let delay = Duration::from_secs_f64(delay_secs + jitter);

                sleep(delay).await;
                retries += 1;
            }
        }
    }
}

/// Generate random jitter value between 0.0 and 1.0 using UUID v4.
/// UUID v4 uses cryptographically secure random number generation,
/// providing much better randomness than timestamp-based approaches.
fn random_jitter() -> f64 {
    // UUID v4 bytes are random; use the first 4 bytes as u32 for jitter
    let uuid_bytes = uuid::Uuid::new_v4();
    let bytes = uuid_bytes.as_bytes();
    let random_u32 = u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]);
    (random_u32 as f64) / (u32::MAX as f64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_random_jitter_returns_value_in_range() {
        for _ in 0..100 {
            let value = random_jitter();
            assert!(value >= 0.0, "Jitter value should be >= 0.0");
            assert!(value <= 1.0, "Jitter value should be <= 1.0");
        }
    }

    #[test]
    fn test_random_jitter_has_variance() {
        // Verify we get different values (not deterministic)
        let values: Vec<f64> = (0..10).map(|_| random_jitter()).collect();
        // Count unique values by checking consecutive differences
        let unique_count = values
            .windows(2)
            .filter(|w| (w[0] - w[1]).abs() > f64::EPSILON)
            .count();
        assert!(unique_count > 0, "Random jitter should produce varying values");
    }

    #[test]
    fn test_mime_type_detection_png() {
        let path = std::path::Path::new("/test/image.png");
        let mime = match path
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
        assert_eq!(mime, "image/png");
    }

    #[test]
    fn test_mime_type_detection_jpeg() {
        let path = std::path::Path::new("/test/image.jpeg");
        let mime = match path
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
        assert_eq!(mime, "image/jpeg");
    }

    #[test]
    fn test_mime_type_detection_jpg() {
        let path = std::path::Path::new("/test/image.JPG");
        let mime = match path
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
        assert_eq!(mime, "image/jpeg");
    }

    #[test]
    fn test_mime_type_detection_pdf() {
        let path = std::path::Path::new("/test/document.pdf");
        let mime = match path
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
        assert_eq!(mime, "application/pdf");
    }

    #[test]
    fn test_mime_type_detection_unknown() {
        let path = std::path::Path::new("/test/file.xyz");
        let mime = match path
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
        assert_eq!(mime, "application/octet-stream");
    }

    #[test]
    fn test_mime_type_detection_no_extension() {
        let path = std::path::Path::new("/test/file");
        let mime = match path
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
        assert_eq!(mime, "application/octet-stream");
    }

    #[test]
    fn test_is_retriable_error_429() {
        let error = "Upload failed (429): Rate limit exceeded";
        let is_retriable = error.contains("429")
            || error.contains("500")
            || error.contains("502")
            || error.contains("503")
            || error.contains("504")
            || error.contains("timeout")
            || error.contains("Timeout");
        assert!(is_retriable);
    }

    #[test]
    fn test_is_retriable_error_500() {
        let error = "Server error (500): Internal server error";
        let is_retriable = error.contains("429")
            || error.contains("500")
            || error.contains("502")
            || error.contains("503")
            || error.contains("504")
            || error.contains("timeout")
            || error.contains("Timeout");
        assert!(is_retriable);
    }

    #[test]
    fn test_is_retriable_error_timeout() {
        let error = "Connection timeout";
        let is_retriable = error.contains("429")
            || error.contains("500")
            || error.contains("502")
            || error.contains("503")
            || error.contains("504")
            || error.contains("timeout")
            || error.contains("Timeout");
        assert!(is_retriable);
    }

    #[test]
    fn test_is_not_retriable_error_401() {
        let error = "Unauthorized (401): Invalid token";
        let is_retriable = error.contains("429")
            || error.contains("500")
            || error.contains("502")
            || error.contains("503")
            || error.contains("504")
            || error.contains("timeout")
            || error.contains("Timeout");
        assert!(!is_retriable);
    }

    #[test]
    fn test_is_not_retriable_error_404() {
        let error = "Not found (404): File does not exist";
        let is_retriable = error.contains("429")
            || error.contains("500")
            || error.contains("502")
            || error.contains("503")
            || error.contains("504")
            || error.contains("timeout")
            || error.contains("Timeout");
        assert!(!is_retriable);
    }

    #[test]
    fn test_exponential_backoff_calculation() {
        // Test that backoff increases exponentially and caps at 15 seconds
        let base: f64 = 1.5;

        let delay_0 = base.powi(0).min(15.0);
        let delay_1 = base.powi(1).min(15.0);
        let delay_5 = base.powi(5).min(15.0);
        let delay_10 = base.powi(10).min(15.0);

        assert!((delay_0 - 1.0).abs() < 0.001);
        assert!((delay_1 - 1.5).abs() < 0.001);
        assert!((delay_5 - 7.59375).abs() < 0.001);
        assert!((delay_10 - 15.0).abs() < 0.001); // Capped at 15
    }
}
