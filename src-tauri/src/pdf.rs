use serde::Serialize;
use std::fs;
use std::path::Path;
use std::process::Command;
use tempfile::TempDir;

#[derive(Debug, Serialize)]
pub struct SplitResult {
    #[serde(rename = "imagePaths")]
    pub image_paths: Vec<String>,
    #[serde(rename = "tempDir")]
    pub temp_dir: String,
}

/// Find the pdftoppm binary path
fn find_pdftoppm() -> Result<String, String> {
    // Try common locations
    let paths = [
        "pdftoppm",                              // System PATH
        "/usr/bin/pdftoppm",                     // Linux
        "/usr/local/bin/pdftoppm",               // macOS Homebrew
        "/opt/homebrew/bin/pdftoppm",            // macOS Homebrew (Apple Silicon)
        "C:\\Program Files\\poppler\\bin\\pdftoppm.exe", // Windows
    ];

    for path in paths {
        let result = if cfg!(windows) {
            Command::new("where").arg(path).output()
        } else {
            Command::new("which").arg(path).output()
        };

        if let Ok(output) = result {
            if output.status.success() {
                return Ok(path.to_string());
            }
        }

        // Also check if the path exists directly
        if Path::new(path).exists() {
            return Ok(path.to_string());
        }
    }

    Err("pdftoppm not found. Please install Poppler utilities.".to_string())
}

/// Find the pdfinfo binary path
fn find_pdfinfo() -> Result<String, String> {
    // Try common locations
    let paths = [
        "pdfinfo",                               // System PATH
        "/usr/bin/pdfinfo",                      // Linux
        "/usr/local/bin/pdfinfo",                // macOS Homebrew
        "/opt/homebrew/bin/pdfinfo",             // macOS Homebrew (Apple Silicon)
        "C:\\Program Files\\poppler\\bin\\pdfinfo.exe", // Windows
    ];

    for path in paths {
        let result = if cfg!(windows) {
            Command::new("where").arg(path).output()
        } else {
            Command::new("which").arg(path).output()
        };

        if let Ok(output) = result {
            if output.status.success() {
                return Ok(path.to_string());
            }
        }

        // Also check if the path exists directly
        if Path::new(path).exists() {
            return Ok(path.to_string());
        }
    }

    Err("pdfinfo not found. Please install Poppler utilities.".to_string())
}

/// Get the total number of pages in a PDF file
#[tauri::command]
pub async fn get_pdf_page_count(pdf_path: String) -> Result<u32, String> {
    let pdfinfo_path = find_pdfinfo()?;

    let output = Command::new(&pdfinfo_path)
        .arg(&pdf_path)
        .output()
        .map_err(|e| format!("Failed to run pdfinfo: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("pdfinfo failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);

    // Parse "Pages: N" from output
    for line in stdout.lines() {
        if line.starts_with("Pages:") {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 {
                return parts[1]
                    .parse()
                    .map_err(|_| "Failed to parse page count".to_string());
            }
        }
    }

    Err("Could not find page count in pdfinfo output".to_string())
}

/// Split a PDF into individual page images
#[tauri::command]
pub async fn split_pdf(
    pdf_path: String,
    dpi: u32,
    _total_pages: u32,
) -> Result<SplitResult, String> {
    let pdftoppm_path = find_pdftoppm()?;

    // Create temp directory
    let temp_dir = TempDir::new().map_err(|e| e.to_string())?;

    // Keep the temp directory (don't auto-delete)
    let temp_path_owned = temp_dir.keep();
    let output_prefix = temp_path_owned.join("page");

    // Run pdftoppm to convert all pages at once
    let output = Command::new(&pdftoppm_path)
        .args([
            "-png",
            "-r",
            &dpi.to_string(),
            &pdf_path,
            output_prefix.to_str().unwrap(),
        ])
        .output()
        .map_err(|e| format!("Failed to run pdftoppm: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("pdftoppm failed: {}", stderr));
    }

    // Collect generated image paths
    let mut image_paths: Vec<String> = fs::read_dir(&temp_path_owned)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let path = entry.path();
            if path.extension()?.to_str()? == "png" {
                Some(path.to_string_lossy().to_string())
            } else {
                None
            }
        })
        .collect();

    // Sort paths to ensure correct page order
    image_paths.sort();

    Ok(SplitResult {
        image_paths,
        temp_dir: temp_path_owned.to_string_lossy().to_string(),
    })
}

/// Extract a single page from a PDF as an image
#[tauri::command]
pub async fn extract_pdf_page(
    pdf_path: String,
    page_number: u32,
    dpi: u32,
    output_path: String,
) -> Result<String, String> {
    let pdftoppm_path = find_pdftoppm()?;

    let output_prefix = output_path.trim_end_matches(".png");

    let output = Command::new(&pdftoppm_path)
        .args([
            "-png",
            "-r",
            &dpi.to_string(),
            "-f",
            &page_number.to_string(),
            "-l",
            &page_number.to_string(),
            &pdf_path,
            output_prefix,
        ])
        .output()
        .map_err(|e| format!("Failed to run pdftoppm: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("pdftoppm failed: {}", stderr));
    }

    // Find the generated file (pdftoppm adds page number suffix)
    let parent = Path::new(&output_path).parent().unwrap_or(Path::new("."));
    let prefix = Path::new(output_prefix)
        .file_name()
        .unwrap()
        .to_string_lossy();

    for entry in fs::read_dir(parent).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let file_name = entry.file_name().to_string_lossy().to_string();
        if file_name.starts_with(&*prefix) && file_name.ends_with(".png") {
            return Ok(entry.path().to_string_lossy().to_string());
        }
    }

    Err("Generated image file not found".to_string())
}

/// Clean up a temporary directory
#[tauri::command]
pub async fn cleanup_temp_dir(path: String) -> Result<(), String> {
    let path = Path::new(&path);
    if path.exists() && path.is_dir() {
        fs::remove_dir_all(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Write binary data to a file (used for DOCX output)
#[tauri::command]
pub async fn write_binary_file(path: String, data: Vec<u8>) -> Result<(), String> {
    fs::write(&path, &data).map_err(|e| format!("Failed to write file: {}", e))
}
