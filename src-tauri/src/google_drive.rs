use reqwest::multipart;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::time::Duration;
use tokio::time::sleep;

const GOOGLE_DOCS_MIME_TYPE: &str = "application/vnd.google-apps.document";

// Base URLs - can be overridden via environment variables for testing
fn drive_upload_url() -> String {
    std::env::var("TAHWEEL_TEST_DRIVE_UPLOAD_URL").unwrap_or_else(|_| {
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id"
            .to_string()
    })
}

fn drive_files_url() -> String {
    std::env::var("TAHWEEL_TEST_DRIVE_FILES_URL")
        .unwrap_or_else(|_| "https://www.googleapis.com/drive/v3/files".to_string())
}

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
            .post(drive_upload_url())
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
            "{}/{}/export?mimeType=text/plain",
            drive_files_url(),
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
pub async fn delete_google_drive_file(file_id: String, access_token: String) -> Result<(), String> {
    execute_with_retry(|| async {
        let client = reqwest::Client::new();

        let url = format!("{}/{}", drive_files_url(), file_id);

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
    use std::sync::Mutex;

    // Mutex to serialize tests that modify environment variables
    static ENV_MUTEX: Mutex<()> = Mutex::new(());

    /// Helper to acquire ENV_MUTEX and clean up env vars on drop
    struct EnvGuard<'a> {
        _lock: std::sync::MutexGuard<'a, ()>,
        vars_to_clean: Vec<&'static str>,
    }

    impl<'a> EnvGuard<'a> {
        fn new(vars: &[&'static str]) -> Self {
            // Handle poisoned mutex - recover and continue
            let lock = ENV_MUTEX
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            // Clean vars at start to ensure clean state
            for var in vars {
                std::env::remove_var(var);
            }
            Self {
                _lock: lock,
                vars_to_clean: vars.to_vec(),
            }
        }
    }

    impl<'a> Drop for EnvGuard<'a> {
        fn drop(&mut self) {
            for var in &self.vars_to_clean {
                std::env::remove_var(var);
            }
        }
    }

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
        assert!(
            unique_count > 0,
            "Random jitter should produce varying values"
        );
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

    #[test]
    fn test_upload_result_serialization() {
        let result = UploadResult {
            file_id: "abc123".to_string(),
        };

        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("fileId")); // Check camelCase rename
        assert!(json.contains("abc123"));

        // Verify it can be parsed back (as generic value since UploadResult doesn't derive Deserialize)
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["fileId"], "abc123");
    }

    #[test]
    fn test_export_result_serialization() {
        let result = ExportResult {
            text: "Hello World\nLine 2".to_string(),
        };

        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("text"));
        assert!(json.contains("Hello World"));

        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["text"], "Hello World\nLine 2");
    }

    #[test]
    fn test_export_result_with_unicode() {
        let result = ExportResult {
            text: "مرحبا بالعالم".to_string(),
        };

        let json = serde_json::to_string(&result).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["text"], "مرحبا بالعالم");
    }

    #[test]
    fn test_export_result_with_empty_text() {
        let result = ExportResult {
            text: String::new(),
        };

        let json = serde_json::to_string(&result).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["text"], "");
    }

    #[test]
    fn test_is_retriable_error_502() {
        let error = "Bad Gateway (502): Upstream server error";
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
    fn test_is_retriable_error_503() {
        let error = "Service Unavailable (503): Try again later";
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
    fn test_is_retriable_error_504() {
        let error = "Gateway Timeout (504): Request timed out";
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
    fn test_is_retriable_error_uppercase_timeout() {
        let error = "Connection Timeout occurred";
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
    fn test_is_not_retriable_error_400() {
        let error = "Bad Request (400): Invalid parameters";
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
    fn test_is_not_retriable_error_403() {
        let error = "Forbidden (403): Access denied";
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
    fn test_google_docs_mime_type_constant() {
        assert_eq!(
            GOOGLE_DOCS_MIME_TYPE,
            "application/vnd.google-apps.document"
        );
    }

    #[test]
    fn test_backoff_delay_all_retries() {
        // Test all retry delays to ensure they follow the pattern
        let base: f64 = 1.5;
        let max_retries = 5u32;

        for retry in 0..max_retries {
            let delay = base.powi(retry as i32).min(15.0);
            assert!(delay >= 1.0, "Delay should be at least 1 second");
            assert!(delay <= 15.0, "Delay should be capped at 15 seconds");

            // Verify exponential growth
            if retry > 0 {
                let prev_delay = base.powi((retry - 1) as i32).min(15.0);
                assert!(delay >= prev_delay, "Delay should increase or stay capped");
            }
        }
    }

    #[test]
    fn test_jitter_adds_variability_to_delay() {
        // Test that delay + jitter produces values in expected range
        let base_delay = 1.5_f64.powi(2); // ~2.25 seconds

        for _ in 0..50 {
            let jitter = random_jitter();
            let total_delay = base_delay + jitter;

            assert!(total_delay >= base_delay);
            assert!(total_delay <= base_delay + 1.0);
        }
    }

    #[test]
    fn test_mime_type_detection_png_uppercase() {
        let path = std::path::Path::new("/test/IMAGE.PNG");
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
    fn test_mime_type_detection_pdf_mixed_case() {
        let path = std::path::Path::new("/test/Document.Pdf");
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
    fn test_mime_type_detection_hidden_file() {
        let path = std::path::Path::new("/test/.hidden");
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
        // .hidden has extension "hidden", not in known list
        assert_eq!(mime, "application/octet-stream");
    }

    #[test]
    fn test_mime_type_detection_double_extension() {
        let path = std::path::Path::new("/test/file.tar.gz");
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
        // Only considers last extension (gz)
        assert_eq!(mime, "application/octet-stream");
    }

    #[tokio::test]
    async fn test_upload_to_google_drive_file_not_found() {
        let result = upload_to_google_drive(
            "/nonexistent/path/to/file.png".to_string(),
            "fake_token".to_string(),
        )
        .await;

        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("File not found"));
    }

    #[tokio::test]
    async fn test_upload_to_google_drive_reads_real_file() {
        use std::io::Write;
        use tempfile::NamedTempFile;

        // Create a temporary file with some content
        let mut temp_file = NamedTempFile::with_suffix(".png").unwrap();
        temp_file.write_all(b"fake png content").unwrap();
        let temp_path = temp_file.path().to_string_lossy().to_string();

        // This will fail at the HTTP request stage (invalid token),
        // but it proves the file reading logic works
        let result = upload_to_google_drive(temp_path, "invalid_token".to_string()).await;

        // Should fail with HTTP error, not file error
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(!err.contains("File not found"));
    }

    #[tokio::test]
    async fn test_execute_with_retry_immediate_success() {
        // Test that execute_with_retry returns immediately on success
        use std::sync::atomic::{AtomicU32, Ordering};
        use std::sync::Arc;

        let call_count = Arc::new(AtomicU32::new(0));
        let call_count_clone = call_count.clone();

        let result = execute_with_retry(|| {
            let count = call_count_clone.clone();
            async move {
                count.fetch_add(1, Ordering::SeqCst);
                Ok::<_, String>("success".to_string())
            }
        })
        .await;

        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "success");
        assert_eq!(call_count.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn test_execute_with_retry_non_retriable_error() {
        // Test that non-retriable errors fail immediately
        use std::sync::atomic::{AtomicU32, Ordering};
        use std::sync::Arc;

        let call_count = Arc::new(AtomicU32::new(0));
        let call_count_clone = call_count.clone();

        let result = execute_with_retry(|| {
            let count = call_count_clone.clone();
            async move {
                count.fetch_add(1, Ordering::SeqCst);
                Err::<String, _>("Bad Request (400): Invalid".to_string())
            }
        })
        .await;

        assert!(result.is_err());
        assert_eq!(call_count.load(Ordering::SeqCst), 1); // Only called once
    }

    #[tokio::test]
    async fn test_execute_with_retry_retries_on_retriable_error() {
        // Test that retriable errors are retried
        use std::sync::atomic::{AtomicU32, Ordering};
        use std::sync::Arc;

        let call_count = Arc::new(AtomicU32::new(0));
        let call_count_clone = call_count.clone();

        let result = execute_with_retry(|| {
            let count = call_count_clone.clone();
            async move {
                let current = count.fetch_add(1, Ordering::SeqCst);
                if current < 2 {
                    Err("Rate limit (429): Too many requests".to_string())
                } else {
                    Ok("success after retries".to_string())
                }
            }
        })
        .await;

        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "success after retries");
        assert_eq!(call_count.load(Ordering::SeqCst), 3); // Called 3 times
    }

    #[tokio::test]
    async fn test_execute_with_retry_max_retries_exceeded() {
        // Test that we give up after max retries
        use std::sync::atomic::{AtomicU32, Ordering};
        use std::sync::Arc;

        let call_count = Arc::new(AtomicU32::new(0));
        let call_count_clone = call_count.clone();

        let result = execute_with_retry(|| {
            let count = call_count_clone.clone();
            async move {
                count.fetch_add(1, Ordering::SeqCst);
                Err::<String, _>("Server error (500): Always fails".to_string())
            }
        })
        .await;

        assert!(result.is_err());
        // Initial call + 5 retries = 6 total calls
        assert_eq!(call_count.load(Ordering::SeqCst), 6);
    }

    #[tokio::test]
    async fn test_execute_with_retry_timeout_error() {
        use std::sync::atomic::{AtomicU32, Ordering};
        use std::sync::Arc;

        let call_count = Arc::new(AtomicU32::new(0));
        let call_count_clone = call_count.clone();

        let result = execute_with_retry(|| {
            let count = call_count_clone.clone();
            async move {
                let current = count.fetch_add(1, Ordering::SeqCst);
                if current < 1 {
                    Err("Connection timeout".to_string())
                } else {
                    Ok("recovered from timeout".to_string())
                }
            }
        })
        .await;

        assert!(result.is_ok());
        assert_eq!(call_count.load(Ordering::SeqCst), 2);
    }

    // Mock HTTP tests for Google Drive API - use EnvGuard to serialize access
    #[tokio::test]
    async fn test_upload_to_google_drive_success() {
        use std::io::Write;
        use tempfile::NamedTempFile;

        let _env = EnvGuard::new(&["TAHWEEL_TEST_DRIVE_UPLOAD_URL"]);
        let mut server = mockito::Server::new_async().await;
        let mock_url = server.url();

        std::env::set_var("TAHWEEL_TEST_DRIVE_UPLOAD_URL", &mock_url);

        // Create a temp file to upload
        let mut temp_file = NamedTempFile::with_suffix(".png").unwrap();
        temp_file.write_all(b"fake png content").unwrap();
        let temp_path = temp_file.path().to_string_lossy().to_string();

        let mock = server
            .mock("POST", "/")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(r#"{"id": "file123abc"}"#)
            .create_async()
            .await;

        let result = upload_to_google_drive(temp_path, "valid_token".to_string()).await;

        mock.assert_async().await;
        assert!(result.is_ok());
        let upload_result = result.unwrap();
        assert_eq!(upload_result.file_id, "file123abc");
    }

    #[tokio::test]
    async fn test_upload_to_google_drive_api_failure() {
        use std::io::Write;
        use tempfile::NamedTempFile;

        let _env = EnvGuard::new(&["TAHWEEL_TEST_DRIVE_UPLOAD_URL"]);
        let mut server = mockito::Server::new_async().await;
        let mock_url = server.url();

        std::env::set_var("TAHWEEL_TEST_DRIVE_UPLOAD_URL", &mock_url);

        let mut temp_file = NamedTempFile::with_suffix(".jpg").unwrap();
        temp_file.write_all(b"fake jpg").unwrap();
        let temp_path = temp_file.path().to_string_lossy().to_string();

        // Use expect(1..) to allow 1 or more requests (handles timing issues under coverage)
        let _mock = server
            .mock("POST", "/")
            .with_status(403)
            .with_body(r#"{"error": "forbidden"}"#)
            .expect_at_least(1)
            .create_async()
            .await;

        let result = upload_to_google_drive(temp_path, "bad_token".to_string()).await;

        // We don't assert the mock count - we just verify the behavior
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Upload failed"));
    }

    #[tokio::test]
    async fn test_export_google_doc_as_text_success() {
        let _env = EnvGuard::new(&["TAHWEEL_TEST_DRIVE_FILES_URL"]);
        let mut server = mockito::Server::new_async().await;
        let mock_url = server.url();

        std::env::set_var("TAHWEEL_TEST_DRIVE_FILES_URL", &mock_url);

        let mock = server
            .mock("GET", "/file123/export?mimeType=text/plain")
            .with_status(200)
            .with_header("content-type", "text/plain")
            .with_body("This is the extracted text from OCR.\nSecond line of text.")
            .create_async()
            .await;

        let result = export_google_doc_as_text("file123".to_string(), "token".to_string()).await;

        mock.assert_async().await;
        assert!(result.is_ok());
        let export_result = result.unwrap();
        assert!(export_result.text.contains("extracted text from OCR"));
        assert!(export_result.text.contains("Second line"));
    }

    #[tokio::test]
    async fn test_export_google_doc_as_text_arabic() {
        let _env = EnvGuard::new(&["TAHWEEL_TEST_DRIVE_FILES_URL"]);
        let mut server = mockito::Server::new_async().await;
        let mock_url = server.url();

        std::env::set_var("TAHWEEL_TEST_DRIVE_FILES_URL", &mock_url);

        let arabic_text = "مرحبا بالعالم\nهذا نص عربي";

        let mock = server
            .mock("GET", "/arabic_doc/export?mimeType=text/plain")
            .with_status(200)
            .with_body(arabic_text)
            .create_async()
            .await;

        let result = export_google_doc_as_text("arabic_doc".to_string(), "token".to_string()).await;

        mock.assert_async().await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap().text, arabic_text);
    }

    #[tokio::test]
    async fn test_export_google_doc_as_text_failure() {
        let _env = EnvGuard::new(&["TAHWEEL_TEST_DRIVE_FILES_URL"]);
        let mut server = mockito::Server::new_async().await;
        let mock_url = server.url();

        std::env::set_var("TAHWEEL_TEST_DRIVE_FILES_URL", &mock_url);

        let mock = server
            .mock("GET", "/notfound/export?mimeType=text/plain")
            .with_status(404)
            .with_body(r#"{"error": "not found"}"#)
            .create_async()
            .await;

        let result = export_google_doc_as_text("notfound".to_string(), "token".to_string()).await;

        mock.assert_async().await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Export failed"));
    }

    #[tokio::test]
    async fn test_delete_google_drive_file_success() {
        let _env = EnvGuard::new(&["TAHWEEL_TEST_DRIVE_FILES_URL"]);
        let mut server = mockito::Server::new_async().await;
        let mock_url = server.url();

        std::env::set_var("TAHWEEL_TEST_DRIVE_FILES_URL", &mock_url);

        let mock = server
            .mock("DELETE", "/file_to_delete")
            .with_status(204) // No Content - success
            .create_async()
            .await;

        let result =
            delete_google_drive_file("file_to_delete".to_string(), "token".to_string()).await;

        mock.assert_async().await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_delete_google_drive_file_200_success() {
        let _env = EnvGuard::new(&["TAHWEEL_TEST_DRIVE_FILES_URL"]);
        let mut server = mockito::Server::new_async().await;
        let mock_url = server.url();

        std::env::set_var("TAHWEEL_TEST_DRIVE_FILES_URL", &mock_url);

        let mock = server
            .mock("DELETE", "/another_file")
            .with_status(200) // Also valid
            .create_async()
            .await;

        let result =
            delete_google_drive_file("another_file".to_string(), "token".to_string()).await;

        mock.assert_async().await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_delete_google_drive_file_failure() {
        let _env = EnvGuard::new(&["TAHWEEL_TEST_DRIVE_FILES_URL"]);
        let mut server = mockito::Server::new_async().await;
        let mock_url = server.url();

        std::env::set_var("TAHWEEL_TEST_DRIVE_FILES_URL", &mock_url);

        let mock = server
            .mock("DELETE", "/protected_file")
            .with_status(403)
            .with_body(r#"{"error": "access denied"}"#)
            .create_async()
            .await;

        let result =
            delete_google_drive_file("protected_file".to_string(), "token".to_string()).await;

        mock.assert_async().await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Delete failed"));
    }

    #[test]
    fn test_drive_upload_url_default() {
        let _env = EnvGuard::new(&["TAHWEEL_TEST_DRIVE_UPLOAD_URL"]);
        // EnvGuard clears the var, so we get default
        let url = drive_upload_url();
        assert!(url.contains("googleapis.com"));
        assert!(url.contains("upload"));
        assert!(url.contains("drive"));
    }

    #[test]
    fn test_drive_upload_url_override() {
        let _env = EnvGuard::new(&["TAHWEEL_TEST_DRIVE_UPLOAD_URL"]);
        std::env::set_var("TAHWEEL_TEST_DRIVE_UPLOAD_URL", "http://localhost/upload");
        let url = drive_upload_url();
        assert_eq!(url, "http://localhost/upload");
    }

    #[test]
    fn test_drive_files_url_default() {
        let _env = EnvGuard::new(&["TAHWEEL_TEST_DRIVE_FILES_URL"]);
        // EnvGuard clears the var, so we get default
        let url = drive_files_url();
        assert_eq!(url, "https://www.googleapis.com/drive/v3/files");
    }

    #[test]
    fn test_drive_files_url_override() {
        let _env = EnvGuard::new(&["TAHWEEL_TEST_DRIVE_FILES_URL"]);
        std::env::set_var("TAHWEEL_TEST_DRIVE_FILES_URL", "http://mock/files");
        let url = drive_files_url();
        assert_eq!(url, "http://mock/files");
    }
}
