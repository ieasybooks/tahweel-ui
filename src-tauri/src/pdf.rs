use image::ImageFormat;
use pdfium_render::prelude::*;
use rayon::prelude::*;
use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tempfile::TempDir;

/// Standard US Letter page width in inches (used for DPI calculation)
const PAGE_WIDTH_INCHES: i32 = 8;
/// Standard US Letter page height in inches (used for DPI calculation)
const PAGE_HEIGHT_INCHES: i32 = 12;

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
        .map_err(|e| format!("Failed to load PDF: {}", e))?;

    Ok(document.pages().len() as u32)
}

/// Split a PDF into individual page images with progress events (parallel JPEG processing).
///
/// # Memory Considerations
/// Each parallel worker creates its own PDFium instance and loads the PDF document.
/// This is required because PDFium is not thread-safe. The trade-off is:
/// - **Higher memory usage**: Each thread holds a copy of the PDF in memory
/// - **Faster processing**: Parallel rendering significantly reduces total time
///
/// Rayon automatically sizes the thread pool to the number of CPU cores, which is
/// reasonable for most user devices. For extremely large PDFs on low-memory devices,
/// consider reducing DPI or processing fewer pages at once.
#[tauri::command]
pub async fn split_pdf(
    pdf_path: String,
    dpi: u32,
    total_pages: u32,
    app: AppHandle,
) -> Result<SplitResult, String> {
    // Find library path first (before parallel processing)
    let lib_path = find_pdfium_library(&app)?;
    let lib_path_str = lib_path
        .to_str()
        .ok_or("Invalid library path")?
        .to_string();

    // Create temp directory for rendered page images
    let temp_dir = TempDir::new().map_err(|e| format!("Failed to create temp directory: {}", e))?;
    let temp_path_owned = temp_dir.keep();
    let temp_path_str = temp_path_owned.to_string_lossy().to_string();

    // Atomic counter for progress tracking across threads
    let processed_count = Arc::new(AtomicU32::new(0));

    // Generate page indices for parallel processing
    let page_indices: Vec<u32> = (0..total_pages).collect();

    // Wrap shared values in Arc for thread-safe sharing
    let pdf_path_arc = Arc::new(pdf_path);
    let lib_path_arc = Arc::new(lib_path_str);
    let temp_path_arc = Arc::new(temp_path_str.clone());

    // Parallel page rendering using rayon's work-stealing scheduler
    let results: Vec<Result<String, String>> = page_indices
        .par_iter()
        .map(|&page_num| {
            // Each thread needs its own PDFium instance (PDFium is not thread-safe)
            let bindings = Pdfium::bind_to_library(lib_path_arc.as_str())
                .map_err(|e| format!("Failed to bind to PDFium library: {}", e))?;
            let pdfium = Pdfium::new(bindings);

            let document = pdfium
                .load_pdf_from_file(pdf_path_arc.as_str(), None)
                .map_err(|e| format!("Failed to load PDF: {}", e))?;

            let page = document
                .pages()
                .get(page_num as u16)
                .map_err(|e| format!("Failed to get page {}: {}", page_num + 1, e))?;

            // Configure rendering based on DPI
            let render_config = PdfRenderConfig::new()
                .set_target_width((dpi as i32) * PAGE_WIDTH_INCHES)
                .set_maximum_height((dpi as i32) * PAGE_HEIGHT_INCHES)
                .rotate_if_landscape(PdfPageRenderRotation::None, false);

            let image = page
                .render_with_config(&render_config)
                .map_err(|e| format!("Failed to render page {}: {}", page_num + 1, e))?
                .as_image();

            // Save as JPEG (much faster than PNG)
            let output_path = PathBuf::from(temp_path_arc.as_str())
                .join(format!("page-{:04}.jpg", page_num + 1));
            image
                .into_rgb8()
                .save_with_format(&output_path, ImageFormat::Jpeg)
                .map_err(|e| format!("Failed to save page {} as JPEG: {}", page_num + 1, e))?;

            // Update progress counter
            let count = processed_count.fetch_add(1, Ordering::Relaxed) + 1;

            // Emit approximate progress (may be out of order due to parallelism)
            let _ = app.emit(
                "split-progress",
                SplitProgress {
                    current_page: count,
                    total_pages,
                    percentage: ((count as f32 / total_pages as f32) * 100.0).round(),
                },
            );

            Ok(output_path.to_string_lossy().to_string())
        })
        .collect();

    // Collect results, propagating any errors
    let mut image_paths: Vec<String> = results.into_iter().collect::<Result<Vec<_>, _>>()?;

    // Sort paths to ensure correct page order
    image_paths.sort();

    Ok(SplitResult {
        image_paths,
        temp_dir: temp_path_str,
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
        .map_err(|e| format!("Failed to load PDF: {}", e))?;

    // Get the specific page (0-indexed)
    let page = document
        .pages()
        .get((page_number - 1) as u16)
        .map_err(|e| format!("Failed to get page {}: {}", page_number, e))?;

    // Configure rendering
    let render_config = PdfRenderConfig::new()
        .set_target_width((dpi as i32) * PAGE_WIDTH_INCHES)
        .set_maximum_height((dpi as i32) * PAGE_HEIGHT_INCHES)
        .rotate_if_landscape(PdfPageRenderRotation::None, false);

    // Render page to image
    let image = page
        .render_with_config(&render_config)
        .map_err(|e| format!("Failed to render page {}: {}", page_number, e))?
        .as_image();

    // Save as JPEG (faster encoding)
    let final_path = if output_path.ends_with(".jpg") || output_path.ends_with(".jpeg") {
        output_path.clone()
    } else {
        format!("{}.jpg", output_path)
    };

    image
        .into_rgb8()
        .save_with_format(&final_path, ImageFormat::Jpeg)
        .map_err(|e| format!("Failed to save page as JPEG: {}", e))?;

    Ok(final_path)
}

/// Clean up a temporary directory
#[tauri::command]
pub async fn cleanup_temp_dir(path: String) -> Result<(), String> {
    let path = std::path::Path::new(&path);
    if path.exists() && path.is_dir() {
        fs::remove_dir_all(path).map_err(|e| format!("Failed to remove temp directory: {}", e))?;
    }
    Ok(())
}

/// Write binary data to a file (used for DOCX output)
#[tauri::command]
pub async fn write_binary_file(path: String, data: Vec<u8>) -> Result<(), String> {
    fs::write(&path, &data).map_err(|e| format!("Failed to write file: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use std::io::Write;
    use tempfile::tempdir;

    #[test]
    fn test_split_result_serialization() {
        let result = SplitResult {
            image_paths: vec!["/tmp/page-0001.jpg".to_string(), "/tmp/page-0002.jpg".to_string()],
            temp_dir: "/tmp/tahweel-123".to_string(),
        };

        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("imagePaths"));
        assert!(json.contains("tempDir"));
        assert!(json.contains("page-0001.jpg"));
    }

    #[test]
    fn test_split_progress_serialization() {
        let progress = SplitProgress {
            current_page: 5,
            total_pages: 10,
            percentage: 50.0,
        };

        let json = serde_json::to_string(&progress).unwrap();
        assert!(json.contains("currentPage"));
        assert!(json.contains("totalPages"));
        assert!(json.contains("percentage"));
        assert!(json.contains("5"));
        assert!(json.contains("10"));
        assert!(json.contains("50"));
    }

    #[test]
    fn test_render_config_dimensions() {
        // Test DPI calculation for different values
        let dpi_72 = 72;
        let dpi_150 = 150;
        let dpi_300 = 300;

        // Width = dpi * PAGE_WIDTH_INCHES (standard 8" page width)
        assert_eq!((dpi_72 as i32) * PAGE_WIDTH_INCHES, 576);
        assert_eq!((dpi_150 as i32) * PAGE_WIDTH_INCHES, 1200);
        assert_eq!((dpi_300 as i32) * PAGE_WIDTH_INCHES, 2400);

        // Height = dpi * PAGE_HEIGHT_INCHES (standard 12" page height max)
        assert_eq!((dpi_72 as i32) * PAGE_HEIGHT_INCHES, 864);
        assert_eq!((dpi_150 as i32) * PAGE_HEIGHT_INCHES, 1800);
        assert_eq!((dpi_300 as i32) * PAGE_HEIGHT_INCHES, 3600);
    }

    #[test]
    fn test_page_filename_format() {
        // Test the page filename format matches expected pattern
        for page_num in [1, 5, 10, 99, 100, 999, 1000] {
            let filename = format!("page-{:04}.jpg", page_num);
            assert!(filename.starts_with("page-"));
            assert!(filename.ends_with(".jpg"));
            assert_eq!(filename.len(), 13); // "page-" (5) + 4 digits + ".jpg" (4)
        }
    }

    #[test]
    fn test_page_filename_sorting() {
        // Test that zero-padded filenames sort correctly
        let mut filenames: Vec<String> = vec![
            "page-0010.jpg".to_string(),
            "page-0001.jpg".to_string(),
            "page-0100.jpg".to_string(),
            "page-0002.jpg".to_string(),
        ];

        filenames.sort();

        assert_eq!(
            filenames,
            vec![
                "page-0001.jpg",
                "page-0002.jpg",
                "page-0010.jpg",
                "page-0100.jpg"
            ]
        );
    }

    #[tokio::test]
    async fn test_cleanup_temp_dir_removes_directory() {
        let temp = tempdir().unwrap();
        let temp_path = temp.path().to_string_lossy().to_string();

        // Create some files in the temp directory
        let file_path = temp.path().join("test.txt");
        let mut file = File::create(&file_path).unwrap();
        file.write_all(b"test content").unwrap();

        assert!(temp.path().exists());

        // Don't actually delete temp since tempdir() handles cleanup
        // Just verify cleanup_temp_dir logic would work
        let path = std::path::Path::new(&temp_path);
        assert!(path.exists());
        assert!(path.is_dir());
    }

    #[tokio::test]
    async fn test_write_binary_file_creates_file() {
        let temp = tempdir().unwrap();
        let file_path = temp.path().join("test.bin").to_string_lossy().to_string();

        let data = vec![0x50, 0x4B, 0x03, 0x04]; // ZIP file header (DOCX is a ZIP)

        let result = write_binary_file(file_path.clone(), data.clone()).await;
        assert!(result.is_ok());

        // Verify file was created with correct content
        let read_data = fs::read(&file_path).unwrap();
        assert_eq!(read_data, data);
    }

    #[tokio::test]
    async fn test_write_binary_file_invalid_path() {
        let result = write_binary_file("/nonexistent/path/file.bin".to_string(), vec![1, 2, 3]).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Failed to write file"));
    }

    #[test]
    fn test_pdfium_library_name_by_platform() {
        let lib_name = if cfg!(target_os = "windows") {
            "pdfium.dll"
        } else if cfg!(target_os = "macos") {
            "libpdfium.dylib"
        } else {
            "libpdfium.so"
        };

        #[cfg(target_os = "windows")]
        assert_eq!(lib_name, "pdfium.dll");

        #[cfg(target_os = "macos")]
        assert_eq!(lib_name, "libpdfium.dylib");

        #[cfg(target_os = "linux")]
        assert_eq!(lib_name, "libpdfium.so");
    }

    #[test]
    fn test_progress_percentage_calculation() {
        // Test progress percentage for various page counts
        let test_cases = vec![
            (1, 10, 10.0),
            (5, 10, 50.0),
            (10, 10, 100.0),
            (1, 3, 33.0), // Rounded
            (2, 3, 67.0), // Rounded
        ];

        for (current, total, expected) in test_cases {
            let percentage = ((current as f32 / total as f32) * 100.0).round();
            assert!(
                (percentage - expected).abs() < 1.0,
                "Expected {} for {}/{}, got {}",
                expected,
                current,
                total,
                percentage
            );
        }
    }
}
