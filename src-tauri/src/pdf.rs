use image::ImageFormat;
use pdfium_render::prelude::*;
use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};
use tempfile::TempDir;

#[derive(Debug, Serialize)]
pub struct SplitResult {
    #[serde(rename = "imagePaths")]
    pub image_paths: Vec<String>,
    #[serde(rename = "tempDir")]
    pub temp_dir: String,
}

#[derive(Clone, Serialize)]
struct SplitProgress {
    #[serde(rename = "currentPage")]
    current_page: u32,
    #[serde(rename = "totalPages")]
    total_pages: u32,
    percentage: f32,
}

/// Find the PDFium library path
fn find_pdfium_library(app: &AppHandle) -> Result<PathBuf, String> {
    let lib_name = if cfg!(target_os = "windows") {
        "pdfium.dll"
    } else if cfg!(target_os = "macos") {
        "libpdfium.dylib"
    } else {
        "libpdfium.so"
    };

    // Try multiple locations
    let mut search_paths = Vec::new();

    // 1. Resource directory (production)
    if let Ok(resource_path) = app.path().resource_dir() {
        search_paths.push(resource_path.join(lib_name));
        search_paths.push(resource_path.join("resources").join(lib_name));
    }

    // 2. Current directory resources (development)
    search_paths.push(PathBuf::from("resources").join(lib_name));
    search_paths.push(PathBuf::from("src-tauri/resources").join(lib_name));

    // 3. Executable directory (fallback)
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            search_paths.push(exe_dir.join(lib_name));
            // On macOS, resources are in Contents/Resources
            search_paths.push(exe_dir.join("../Resources").join(lib_name));
        }
    }

    for path in &search_paths {
        if path.exists() {
            return Ok(path.clone());
        }
    }

    Err(format!(
        "PDFium library '{}' not found. Searched: {:?}",
        lib_name, search_paths
    ))
}

/// Create a PDFium instance
fn create_pdfium(app: &AppHandle) -> Result<Pdfium, String> {
    let lib_path = find_pdfium_library(app)?;

    let bindings = Pdfium::bind_to_library(lib_path.to_str().unwrap())
        .map_err(|e| format!("Failed to bind to PDFium library: {}", e))?;

    Ok(Pdfium::new(bindings))
}

/// Get the total number of pages in a PDF file
#[tauri::command]
pub async fn get_pdf_page_count(pdf_path: String, app: AppHandle) -> Result<u32, String> {
    let pdfium = create_pdfium(&app)?;

    let document = pdfium
        .load_pdf_from_file(&pdf_path, None)
        .map_err(|e| format!("Failed to load PDF: {:?}", e))?;

    Ok(document.pages().len() as u32)
}

/// Split a PDF into individual page images with progress events
#[tauri::command]
pub async fn split_pdf(
    pdf_path: String,
    dpi: u32,
    total_pages: u32,
    app: AppHandle,
) -> Result<SplitResult, String> {
    let pdfium = create_pdfium(&app)?;

    let document = pdfium
        .load_pdf_from_file(&pdf_path, None)
        .map_err(|e| format!("Failed to load PDF: {:?}", e))?;

    // Create temp directory
    let temp_dir = TempDir::new().map_err(|e| e.to_string())?;

    // Keep the temp directory (don't auto-delete)
    let temp_path_owned = temp_dir.keep();

    let mut image_paths: Vec<String> = Vec::new();

    // Configure rendering based on DPI
    // Standard letter/A4 is roughly 8.5x11 inches
    let render_config = PdfRenderConfig::new()
        .set_target_width((dpi as i32) * 8) // ~8 inches width
        .set_maximum_height((dpi as i32) * 12) // ~12 inches height
        .rotate_if_landscape(PdfPageRenderRotation::None, false);

    // Render each page
    for (index, page) in document.pages().iter().enumerate() {
        let page_num = (index + 1) as u32;

        // Emit progress event
        let _ = app.emit(
            "split-progress",
            SplitProgress {
                current_page: page_num,
                total_pages,
                percentage: ((page_num as f32 / total_pages as f32) * 100.0).round(),
            },
        );

        // Render page to image
        let image = page
            .render_with_config(&render_config)
            .map_err(|e| format!("Failed to render page {}: {:?}", page_num, e))?
            .as_image();

        // Save as PNG
        let output_path = temp_path_owned.join(format!("page-{:04}.png", page_num));
        image
            .into_rgb8()
            .save_with_format(&output_path, ImageFormat::Png)
            .map_err(|e| format!("Failed to save page {} as PNG: {}", page_num, e))?;

        image_paths.push(output_path.to_string_lossy().to_string());
    }

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
    app: AppHandle,
) -> Result<String, String> {
    let pdfium = create_pdfium(&app)?;

    let document = pdfium
        .load_pdf_from_file(&pdf_path, None)
        .map_err(|e| format!("Failed to load PDF: {:?}", e))?;

    // Get the specific page (0-indexed)
    let page = document
        .pages()
        .get((page_number - 1) as u16)
        .map_err(|e| format!("Failed to get page {}: {:?}", page_number, e))?;

    // Configure rendering
    let render_config = PdfRenderConfig::new()
        .set_target_width((dpi as i32) * 8)
        .set_maximum_height((dpi as i32) * 12)
        .rotate_if_landscape(PdfPageRenderRotation::None, false);

    // Render page to image
    let image = page
        .render_with_config(&render_config)
        .map_err(|e| format!("Failed to render page {}: {:?}", page_number, e))?
        .as_image();

    // Save as PNG
    let final_path = if output_path.ends_with(".png") {
        output_path.clone()
    } else {
        format!("{}.png", output_path)
    };

    image
        .into_rgb8()
        .save_with_format(&final_path, ImageFormat::Png)
        .map_err(|e| format!("Failed to save page as PNG: {}", e))?;

    Ok(final_path)
}

/// Clean up a temporary directory
#[tauri::command]
pub async fn cleanup_temp_dir(path: String) -> Result<(), String> {
    let path = std::path::Path::new(&path);
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
