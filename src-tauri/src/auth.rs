use serde::{Deserialize, Serialize};
use std::fs;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpListener;

const CLIENT_ID: &str = "512416833080-808aqp20iith31t9rgtdmsgc53jp0sc2.apps.googleusercontent.com";
const CLIENT_SECRET: &str = "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";
const REDIRECT_URI: &str = "http://localhost:3027/";
const AUTH_SCOPE: &str = "https://www.googleapis.com/auth/drive.file";

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
        .post("https://oauth2.googleapis.com/token")
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
        .post("https://oauth2.googleapis.com/token")
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
        .get("https://www.googleapis.com/oauth2/v2/userinfo")
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
}
