use serde::{Deserialize, Serialize};
use std::fs;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpListener;

const CLIENT_ID: &str = "512416833080-808aqp20iith31t9rgtdmsgc53jp0sc2.apps.googleusercontent.com";
const CLIENT_SECRET: &str = "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";
const REDIRECT_URI: &str = "http://localhost:3027/";
const AUTH_SCOPE: &str = "https://www.googleapis.com/auth/drive.file";

// Base URLs - can be overridden via environment variables for testing
fn oauth_token_url() -> String {
    std::env::var("TAHWEEL_TEST_OAUTH_URL")
        .unwrap_or_else(|_| "https://oauth2.googleapis.com/token".to_string())
}

fn userinfo_url() -> String {
    std::env::var("TAHWEEL_TEST_USERINFO_URL")
        .unwrap_or_else(|_| "https://www.googleapis.com/oauth2/v2/userinfo".to_string())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthTokens {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: u64,
}

#[derive(Debug, Serialize, Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: u64,
    token_type: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct StoredTokens {
    access_token: String,
    refresh_token: String,
    expires_at: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UserInfo {
    pub email: Option<String>,
}

const SUCCESS_HTML: &str = r#"<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tahweel Authorization</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&family=Poppins:wght@400;600&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary-color: #10b981;
            --bg-gradient: linear-gradient(135deg, #f0fdf4 0%, #d1fae5 100%);
            --text-dark: #1f2937;
            --text-light: #6b7280;
        }
        body {
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--bg-gradient);
            font-family: 'Cairo', sans-serif;
        }
        .container {
            background: rgba(255, 255, 255, 0.95);
            padding: 3rem;
            border-radius: 24px;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
            text-align: center;
            max-width: 420px;
        }
        .icon-wrapper {
            width: 80px;
            height: 80px;
            background: #d1fae5;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 1.5rem auto;
            color: var(--primary-color);
        }
        .icon-wrapper svg {
            width: 40px;
            height: 40px;
            stroke-width: 3;
            stroke: currentColor;
            fill: none;
        }
        h1 { color: var(--text-dark); font-size: 1.5rem; margin: 0 0 0.5rem 0; }
        p { color: var(--text-light); font-size: 1rem; margin: 0 0 1rem 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon-wrapper">
            <svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"></path></svg>
        </div>
        <h1>تمت المُصادقة بنجاح!</h1>
        <p>لقد قمت بتسجيل الدخول بنجاح إلى تحويل.</p>
        <p style="font-size: 0.875rem;">يمكنك إغلاق هذه النافذة والعودة إلى البرنامج.</p>
    </div>
</body>
</html>"#;

fn get_token_path() -> std::path::PathBuf {
    let base = dirs::cache_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
    let dir = base.join("tahweel");
    fs::create_dir_all(&dir).ok();
    dir.join("token.json")
}

#[tauri::command]
pub async fn start_oauth_flow(_app: tauri::AppHandle) -> Result<AuthTokens, String> {
    // Build authorization URL
    let auth_url = format!(
        "https://accounts.google.com/o/oauth2/v2/auth?\
        client_id={}&\
        redirect_uri={}&\
        response_type=code&\
        scope={}&\
        access_type=offline&\
        prompt=consent",
        CLIENT_ID,
        urlencoding::encode(REDIRECT_URI),
        urlencoding::encode(AUTH_SCOPE)
    );

    // Start TCP server to receive callback (async)
    let listener = TcpListener::bind("127.0.0.1:3027")
        .await
        .map_err(|e| format!("Failed to bind to port 3027: {}", e))?;

    // Open browser AFTER binding the port (so the callback URL is ready)
    open::that(&auth_url).map_err(|e| format!("Failed to open browser: {}", e))?;

    // Wait for the OAuth callback
    let code = loop {
        let (mut stream, _) = listener
            .accept()
            .await
            .map_err(|e| format!("Failed to accept connection: {}", e))?;

        let (reader, mut writer) = stream.split();
        let mut buf_reader = BufReader::new(reader);
        let mut request_line = String::new();

        buf_reader
            .read_line(&mut request_line)
            .await
            .map_err(|e| format!("Failed to read request: {}", e))?;

        // Check if this is the OAuth callback
        if let Some(code) = extract_code(&request_line) {
            // Send success response
            let response = format!(
                "HTTP/1.1 200 OK\r\n\
                Content-Type: text/html; charset=utf-8\r\n\
                Content-Length: {}\r\n\
                Connection: close\r\n\
                \r\n\
                {}",
                SUCCESS_HTML.len(),
                SUCCESS_HTML
            );
            writer.write_all(response.as_bytes()).await.ok();
            writer.flush().await.ok();
            break code;
        } else {
            // Send 404 for other requests (like favicon.ico)
            let response = "HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n";
            writer.write_all(response.as_bytes()).await.ok();
            writer.flush().await.ok();
        }
    };

    // Exchange code for tokens
    let tokens = exchange_code_for_tokens(&code).await?;

    // Store tokens
    store_tokens(&tokens)?;

    Ok(tokens)
}

fn extract_code(request_line: &str) -> Option<String> {
    // Parse: GET /?code=... HTTP/1.1
    if !request_line.starts_with("GET ") {
        return None;
    }

    let path = request_line
        .strip_prefix("GET ")?
        .split_whitespace()
        .next()?;

    if !path.contains("code=") {
        return None;
    }

    let url = url::Url::parse(&format!("http://localhost{}", path)).ok()?;
    url.query_pairs()
        .find(|(key, _)| key == "code")
        .map(|(_, value)| value.to_string())
}

async fn exchange_code_for_tokens(code: &str) -> Result<AuthTokens, String> {
    let client = reqwest::Client::new();
    let response = client
        .post(&oauth_token_url())
        .form(&[
            ("code", code),
            ("client_id", CLIENT_ID),
            ("client_secret", CLIENT_SECRET),
            ("redirect_uri", REDIRECT_URI),
            ("grant_type", "authorization_code"),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Token exchange failed: {}", text));
    }

    let token_response: TokenResponse = response.json().await.map_err(|e| e.to_string())?;

    Ok(AuthTokens {
        access_token: token_response.access_token,
        refresh_token: token_response.refresh_token.unwrap_or_default(),
        expires_in: token_response.expires_in,
    })
}

fn store_tokens(tokens: &AuthTokens) -> Result<(), String> {
    let stored = StoredTokens {
        access_token: tokens.access_token.clone(),
        refresh_token: tokens.refresh_token.clone(),
        expires_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs()
            + tokens.expires_in,
    };

    let json = serde_json::to_string_pretty(&stored).map_err(|e| e.to_string())?;
    fs::write(get_token_path(), json).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn refresh_access_token(refresh_token: String) -> Result<AuthTokens, String> {
    let client = reqwest::Client::new();
    let response = client
        .post(&oauth_token_url())
        .form(&[
            ("refresh_token", refresh_token.as_str()),
            ("client_id", CLIENT_ID),
            ("client_secret", CLIENT_SECRET),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Token refresh failed: {}", text));
    }

    let token_response: TokenResponse = response.json().await.map_err(|e| e.to_string())?;

    let tokens = AuthTokens {
        access_token: token_response.access_token,
        refresh_token: token_response.refresh_token.unwrap_or(refresh_token),
        expires_in: token_response.expires_in,
    };

    store_tokens(&tokens)?;

    Ok(tokens)
}

#[tauri::command]
pub async fn load_stored_tokens() -> Result<Option<AuthTokens>, String> {
    let path = get_token_path();
    if !path.exists() {
        return Ok(None);
    }

    let json = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let stored: StoredTokens = serde_json::from_str(&json).map_err(|e| e.to_string())?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    // Return tokens with remaining time
    let expires_in = if stored.expires_at > now {
        stored.expires_at - now
    } else {
        0
    };

    Ok(Some(AuthTokens {
        access_token: stored.access_token,
        refresh_token: stored.refresh_token,
        expires_in,
    }))
}

#[tauri::command]
pub async fn clear_auth_tokens() -> Result<(), String> {
    let path = get_token_path();
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn get_user_info(access_token: String) -> Result<UserInfo, String> {
    let client = reqwest::Client::new();
    let response = client
        .get(&userinfo_url())
        .bearer_auth(&access_token)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err("Failed to get user info".to_string());
    }

    let info: UserInfo = response.json().await.map_err(|e| e.to_string())?;
    Ok(info)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    // Mutex to serialize tests that access the token file
    static TOKEN_FILE_MUTEX: Mutex<()> = Mutex::new(());

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
            let lock = ENV_MUTEX.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
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
    fn test_extract_code_valid_request() {
        let request = "GET /?code=4/0AcvDMrBxyz123 HTTP/1.1";
        let result = extract_code(request);
        assert_eq!(result, Some("4/0AcvDMrBxyz123".to_string()));
    }

    #[test]
    fn test_extract_code_with_additional_params() {
        let request = "GET /?code=abc123&scope=email HTTP/1.1";
        let result = extract_code(request);
        assert_eq!(result, Some("abc123".to_string()));
    }

    #[test]
    fn test_extract_code_invalid_method() {
        let request = "POST /?code=abc123 HTTP/1.1";
        let result = extract_code(request);
        assert_eq!(result, None);
    }

    #[test]
    fn test_extract_code_no_code_param() {
        let request = "GET /?error=access_denied HTTP/1.1";
        let result = extract_code(request);
        assert_eq!(result, None);
    }

    #[test]
    fn test_extract_code_favicon_request() {
        let request = "GET /favicon.ico HTTP/1.1";
        let result = extract_code(request);
        assert_eq!(result, None);
    }

    #[test]
    fn test_extract_code_empty_request() {
        let request = "";
        let result = extract_code(request);
        assert_eq!(result, None);
    }

    #[test]
    fn test_extract_code_root_path() {
        let request = "GET / HTTP/1.1";
        let result = extract_code(request);
        assert_eq!(result, None);
    }

    #[test]
    fn test_extract_code_url_encoded() {
        let request = "GET /?code=4%2F0AcvDMr HTTP/1.1";
        let result = extract_code(request);
        // URL decoding happens via url crate
        assert!(result.is_some());
    }

    #[test]
    fn test_get_token_path_returns_valid_path() {
        let path = get_token_path();
        assert!(path.to_string_lossy().contains("tahweel"));
        assert!(path.to_string_lossy().ends_with("token.json"));
    }

    #[test]
    fn test_get_token_path_creates_directory() {
        let path = get_token_path();
        let parent = path.parent().unwrap();
        // The function should create the directory if it doesn't exist
        assert!(parent.exists() || get_token_path().parent().unwrap().exists());
    }

    /// Helper to backup and restore token file during tests.
    /// Also holds the mutex lock to prevent test interference.
    struct TokenFileGuard<'a> {
        path: std::path::PathBuf,
        backup: Option<String>,
        _lock: std::sync::MutexGuard<'a, ()>,
    }

    impl<'a> TokenFileGuard<'a> {
        fn new() -> Self {
            // Acquire mutex first to prevent race conditions
            // Handle poisoned mutex - recover and continue
            let lock = TOKEN_FILE_MUTEX.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
            let path = get_token_path();
            let backup = if path.exists() {
                fs::read_to_string(&path).ok()
            } else {
                None
            };
            Self { path, backup, _lock: lock }
        }
    }

    impl<'a> Drop for TokenFileGuard<'a> {
        fn drop(&mut self) {
            // Restore original state before releasing the lock
            if let Some(ref content) = self.backup {
                fs::write(&self.path, content).ok();
            } else if self.path.exists() {
                fs::remove_file(&self.path).ok();
            }
        }
    }

    #[test]
    fn test_store_tokens_creates_file() {
        let guard = TokenFileGuard::new();
        let path = guard.path.clone();

        // Remove file if exists
        if path.exists() {
            fs::remove_file(&path).unwrap();
        }

        let tokens = AuthTokens {
            access_token: "test_access_token".to_string(),
            refresh_token: "test_refresh_token".to_string(),
            expires_in: 3600,
        };

        let result = store_tokens(&tokens);
        assert!(result.is_ok());
        assert!(path.exists());
    }

    #[test]
    fn test_store_tokens_writes_correct_content() {
        let guard = TokenFileGuard::new();
        let path = guard.path.clone();

        let tokens = AuthTokens {
            access_token: "my_access".to_string(),
            refresh_token: "my_refresh".to_string(),
            expires_in: 7200,
        };

        store_tokens(&tokens).unwrap();

        let content = fs::read_to_string(&path).unwrap();
        let stored: StoredTokens = serde_json::from_str(&content).unwrap();

        assert_eq!(stored.access_token, "my_access");
        assert_eq!(stored.refresh_token, "my_refresh");
        // expires_at should be approximately now + 7200 seconds
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        assert!(stored.expires_at >= now + 7199);
        assert!(stored.expires_at <= now + 7201);
    }

    #[tokio::test]
    async fn test_load_stored_tokens_returns_none_when_no_file() {
        let guard = TokenFileGuard::new();
        let path = guard.path.clone();

        // Ensure file doesn't exist
        if path.exists() {
            fs::remove_file(&path).unwrap();
        }

        let result = load_stored_tokens().await;
        assert!(result.is_ok());
        assert!(result.unwrap().is_none());
    }

    #[tokio::test]
    async fn test_store_and_load_tokens_roundtrip() {
        let _guard = TokenFileGuard::new();

        let tokens = AuthTokens {
            access_token: "roundtrip_access".to_string(),
            refresh_token: "roundtrip_refresh".to_string(),
            expires_in: 3600,
        };

        store_tokens(&tokens).unwrap();

        let loaded = load_stored_tokens().await.unwrap().unwrap();
        assert_eq!(loaded.access_token, "roundtrip_access");
        assert_eq!(loaded.refresh_token, "roundtrip_refresh");
        // expires_in should be close to 3600 (minus a few seconds for test execution)
        assert!(loaded.expires_in >= 3595);
        assert!(loaded.expires_in <= 3600);
    }

    #[tokio::test]
    async fn test_load_stored_tokens_with_expired_token() {
        let guard = TokenFileGuard::new();
        let path = guard.path.clone();

        // Write a token that expired in the past
        let expired = StoredTokens {
            access_token: "expired_access".to_string(),
            refresh_token: "expired_refresh".to_string(),
            expires_at: 1000, // Way in the past (1970)
        };

        let json = serde_json::to_string_pretty(&expired).unwrap();
        fs::write(&path, json).unwrap();

        let loaded = load_stored_tokens().await.unwrap().unwrap();
        assert_eq!(loaded.access_token, "expired_access");
        assert_eq!(loaded.refresh_token, "expired_refresh");
        assert_eq!(loaded.expires_in, 0); // Expired tokens return 0
    }

    #[tokio::test]
    async fn test_load_stored_tokens_with_future_expiry() {
        let guard = TokenFileGuard::new();
        let path = guard.path.clone();

        let future_time = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs()
            + 1800; // 30 minutes from now

        let stored = StoredTokens {
            access_token: "future_access".to_string(),
            refresh_token: "future_refresh".to_string(),
            expires_at: future_time,
        };

        let json = serde_json::to_string_pretty(&stored).unwrap();
        fs::write(&path, json).unwrap();

        let loaded = load_stored_tokens().await.unwrap().unwrap();
        assert!(loaded.expires_in >= 1795);
        assert!(loaded.expires_in <= 1800);
    }

    #[tokio::test]
    async fn test_load_stored_tokens_invalid_json() {
        let guard = TokenFileGuard::new();
        let path = guard.path.clone();

        fs::write(&path, "not valid json {{{{").unwrap();

        let result = load_stored_tokens().await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_load_stored_tokens_missing_fields() {
        let guard = TokenFileGuard::new();
        let path = guard.path.clone();

        // JSON missing required fields
        fs::write(&path, r#"{"access_token": "only_access"}"#).unwrap();

        let result = load_stored_tokens().await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_clear_auth_tokens_removes_file() {
        let guard = TokenFileGuard::new();
        let path = guard.path.clone();

        // Create a token file first
        let tokens = AuthTokens {
            access_token: "to_be_cleared".to_string(),
            refresh_token: "to_be_cleared".to_string(),
            expires_in: 3600,
        };
        store_tokens(&tokens).unwrap();
        assert!(path.exists());

        // Clear it
        let result = clear_auth_tokens().await;
        assert!(result.is_ok());
        assert!(!path.exists());

        // Restore will happen in guard drop, but file won't exist
        // That's OK, guard handles this case
        drop(guard);
    }

    #[tokio::test]
    async fn test_clear_auth_tokens_succeeds_when_no_file() {
        let guard = TokenFileGuard::new();
        let path = guard.path.clone();

        // Ensure file doesn't exist
        if path.exists() {
            fs::remove_file(&path).unwrap();
        }

        // Should succeed even when file doesn't exist
        let result = clear_auth_tokens().await;
        assert!(result.is_ok());

        drop(guard);
    }

    #[test]
    fn test_auth_tokens_serialization() {
        let tokens = AuthTokens {
            access_token: "access".to_string(),
            refresh_token: "refresh".to_string(),
            expires_in: 3600,
        };

        let json = serde_json::to_string(&tokens).unwrap();
        assert!(json.contains("access_token"));
        assert!(json.contains("refresh_token"));
        assert!(json.contains("expires_in"));
    }

    #[test]
    fn test_stored_tokens_serialization() {
        let stored = StoredTokens {
            access_token: "access".to_string(),
            refresh_token: "refresh".to_string(),
            expires_at: 1234567890,
        };

        let json = serde_json::to_string(&stored).unwrap();
        let deserialized: StoredTokens = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.access_token, "access");
        assert_eq!(deserialized.refresh_token, "refresh");
        assert_eq!(deserialized.expires_at, 1234567890);
    }

    #[test]
    fn test_user_info_serialization() {
        let info = UserInfo {
            email: Some("test@example.com".to_string()),
        };

        let json = serde_json::to_string(&info).unwrap();
        let deserialized: UserInfo = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.email, Some("test@example.com".to_string()));
    }

    #[test]
    fn test_user_info_with_null_email() {
        let info = UserInfo { email: None };

        let json = serde_json::to_string(&info).unwrap();
        let deserialized: UserInfo = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.email, None);
    }

    #[test]
    fn test_extract_code_with_state_param() {
        let request = "GET /?state=xyz&code=auth_code_123 HTTP/1.1";
        let result = extract_code(request);
        assert_eq!(result, Some("auth_code_123".to_string()));
    }

    #[test]
    fn test_extract_code_code_at_end() {
        let request = "GET /?scope=email&code=final_code HTTP/1.1";
        let result = extract_code(request);
        assert_eq!(result, Some("final_code".to_string()));
    }

    #[test]
    fn test_extract_code_with_special_characters() {
        // OAuth codes often contain slashes and other special chars
        let request = "GET /?code=4/P7q7W91a-oMsCeLvIaQm6bTrgtp7 HTTP/1.1";
        let result = extract_code(request);
        assert_eq!(result, Some("4/P7q7W91a-oMsCeLvIaQm6bTrgtp7".to_string()));
    }

    #[test]
    fn test_success_html_contains_expected_content() {
        assert!(SUCCESS_HTML.contains("<!DOCTYPE html>"));
        assert!(SUCCESS_HTML.contains("تمت المُصادقة بنجاح")); // "Authentication successful" in Arabic
        assert!(SUCCESS_HTML.contains("تحويل")); // "Tahweel" in Arabic
        assert!(SUCCESS_HTML.contains("Tahweel")); // App name in title
    }

    #[test]
    fn test_constants_are_valid() {
        assert!(!CLIENT_ID.is_empty());
        assert!(CLIENT_ID.contains(".apps.googleusercontent.com"));
        assert!(!CLIENT_SECRET.is_empty());
        assert_eq!(REDIRECT_URI, "http://localhost:3027/");
        assert!(AUTH_SCOPE.contains("drive"));
    }

    // HTTP mocking tests - use EnvGuard to serialize access to env vars
    #[tokio::test]
    async fn test_exchange_code_for_tokens_success() {
        let _env = EnvGuard::new(&["TAHWEEL_TEST_OAUTH_URL"]);
        let mut server = mockito::Server::new_async().await;
        let mock_url = server.url();

        std::env::set_var("TAHWEEL_TEST_OAUTH_URL", &mock_url);

        let mock = server
            .mock("POST", "/")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(
                r#"{
                    "access_token": "mock_access_token",
                    "refresh_token": "mock_refresh_token",
                    "expires_in": 3600,
                    "token_type": "Bearer"
                }"#,
            )
            .create_async()
            .await;

        let result = exchange_code_for_tokens("test_auth_code").await;

        mock.assert_async().await;
        assert!(result.is_ok());
        let tokens = result.unwrap();
        assert_eq!(tokens.access_token, "mock_access_token");
        assert_eq!(tokens.refresh_token, "mock_refresh_token");
        assert_eq!(tokens.expires_in, 3600);
    }

    #[tokio::test]
    async fn test_exchange_code_for_tokens_failure() {
        let _env = EnvGuard::new(&["TAHWEEL_TEST_OAUTH_URL"]);
        let mut server = mockito::Server::new_async().await;
        let mock_url = server.url();

        std::env::set_var("TAHWEEL_TEST_OAUTH_URL", &mock_url);

        let mock = server
            .mock("POST", "/")
            .with_status(400)
            .with_body(r#"{"error": "invalid_grant"}"#)
            .create_async()
            .await;

        let result = exchange_code_for_tokens("invalid_code").await;

        mock.assert_async().await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Token exchange failed"));
    }

    #[tokio::test]
    async fn test_exchange_code_for_tokens_no_refresh_token() {
        let _env = EnvGuard::new(&["TAHWEEL_TEST_OAUTH_URL"]);
        let mut server = mockito::Server::new_async().await;
        let mock_url = server.url();

        std::env::set_var("TAHWEEL_TEST_OAUTH_URL", &mock_url);

        let mock = server
            .mock("POST", "/")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(
                r#"{
                    "access_token": "access_only",
                    "expires_in": 3600,
                    "token_type": "Bearer"
                }"#,
            )
            .create_async()
            .await;

        let result = exchange_code_for_tokens("code").await;

        mock.assert_async().await;
        assert!(result.is_ok());
        let tokens = result.unwrap();
        assert_eq!(tokens.access_token, "access_only");
        assert_eq!(tokens.refresh_token, ""); // Default empty string
    }

    #[tokio::test]
    async fn test_refresh_access_token_success() {
        let _env = EnvGuard::new(&["TAHWEEL_TEST_OAUTH_URL"]);
        let _guard = TokenFileGuard::new();
        let mut server = mockito::Server::new_async().await;
        let mock_url = server.url();

        std::env::set_var("TAHWEEL_TEST_OAUTH_URL", &mock_url);

        let mock = server
            .mock("POST", "/")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(
                r#"{
                    "access_token": "new_access_token",
                    "expires_in": 3600,
                    "token_type": "Bearer"
                }"#,
            )
            .create_async()
            .await;

        let result = refresh_access_token("old_refresh_token".to_string()).await;

        mock.assert_async().await;
        assert!(result.is_ok());
        let tokens = result.unwrap();
        assert_eq!(tokens.access_token, "new_access_token");
        // When no new refresh token is returned, the old one is kept
        assert_eq!(tokens.refresh_token, "old_refresh_token");
    }

    #[tokio::test]
    async fn test_refresh_access_token_with_new_refresh_token() {
        let _env = EnvGuard::new(&["TAHWEEL_TEST_OAUTH_URL"]);
        let _guard = TokenFileGuard::new();
        let mut server = mockito::Server::new_async().await;
        let mock_url = server.url();

        std::env::set_var("TAHWEEL_TEST_OAUTH_URL", &mock_url);

        let mock = server
            .mock("POST", "/")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(
                r#"{
                    "access_token": "new_access",
                    "refresh_token": "new_refresh",
                    "expires_in": 7200,
                    "token_type": "Bearer"
                }"#,
            )
            .create_async()
            .await;

        let result = refresh_access_token("old_refresh".to_string()).await;

        mock.assert_async().await;
        assert!(result.is_ok());
        let tokens = result.unwrap();
        assert_eq!(tokens.access_token, "new_access");
        assert_eq!(tokens.refresh_token, "new_refresh");
    }

    #[tokio::test]
    async fn test_refresh_access_token_failure() {
        let _env = EnvGuard::new(&["TAHWEEL_TEST_OAUTH_URL"]);
        let mut server = mockito::Server::new_async().await;
        let mock_url = server.url();

        std::env::set_var("TAHWEEL_TEST_OAUTH_URL", &mock_url);

        let mock = server
            .mock("POST", "/")
            .with_status(401)
            .with_body(r#"{"error": "invalid_token"}"#)
            .create_async()
            .await;

        let result = refresh_access_token("invalid_token".to_string()).await;

        mock.assert_async().await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Token refresh failed"));
    }

    #[tokio::test]
    async fn test_get_user_info_success() {
        let _env = EnvGuard::new(&["TAHWEEL_TEST_USERINFO_URL"]);
        let mut server = mockito::Server::new_async().await;
        let mock_url = server.url();

        std::env::set_var("TAHWEEL_TEST_USERINFO_URL", &mock_url);

        let mock = server
            .mock("GET", "/")
            .match_header("authorization", "Bearer valid_token")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(r#"{"email": "user@example.com"}"#)
            .create_async()
            .await;

        let result = get_user_info("valid_token".to_string()).await;

        mock.assert_async().await;
        assert!(result.is_ok());
        let info = result.unwrap();
        assert_eq!(info.email, Some("user@example.com".to_string()));
    }

    #[tokio::test]
    async fn test_get_user_info_with_null_email_mock() {
        let _env = EnvGuard::new(&["TAHWEEL_TEST_USERINFO_URL"]);
        let mut server = mockito::Server::new_async().await;
        let mock_url = server.url();

        std::env::set_var("TAHWEEL_TEST_USERINFO_URL", &mock_url);

        let mock = server
            .mock("GET", "/")
            .with_status(200)
            .with_header("content-type", "application/json")
            .with_body(r#"{"email": null}"#)
            .create_async()
            .await;

        let result = get_user_info("token".to_string()).await;

        mock.assert_async().await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap().email, None);
    }

    #[tokio::test]
    async fn test_get_user_info_unauthorized() {
        let _env = EnvGuard::new(&["TAHWEEL_TEST_USERINFO_URL"]);
        let mut server = mockito::Server::new_async().await;
        let mock_url = server.url();

        std::env::set_var("TAHWEEL_TEST_USERINFO_URL", &mock_url);

        let mock = server
            .mock("GET", "/")
            .with_status(401)
            .with_body(r#"{"error": "unauthorized"}"#)
            .create_async()
            .await;

        let result = get_user_info("invalid_token".to_string()).await;

        mock.assert_async().await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Failed to get user info"));
    }

    #[test]
    fn test_oauth_token_url_default() {
        let _env = EnvGuard::new(&["TAHWEEL_TEST_OAUTH_URL"]);
        let url = oauth_token_url();
        assert_eq!(url, "https://oauth2.googleapis.com/token");
    }

    #[test]
    fn test_oauth_token_url_override() {
        let _env = EnvGuard::new(&["TAHWEEL_TEST_OAUTH_URL"]);
        std::env::set_var("TAHWEEL_TEST_OAUTH_URL", "http://localhost:8080/token");
        let url = oauth_token_url();
        assert_eq!(url, "http://localhost:8080/token");
    }

    #[test]
    fn test_userinfo_url_default() {
        let _env = EnvGuard::new(&["TAHWEEL_TEST_USERINFO_URL"]);
        let url = userinfo_url();
        assert_eq!(url, "https://www.googleapis.com/oauth2/v2/userinfo");
    }

    #[test]
    fn test_userinfo_url_override() {
        let _env = EnvGuard::new(&["TAHWEEL_TEST_USERINFO_URL"]);
        std::env::set_var("TAHWEEL_TEST_USERINFO_URL", "http://localhost:8080/userinfo");
        let url = userinfo_url();
        assert_eq!(url, "http://localhost:8080/userinfo");
    }
}
