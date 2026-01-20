use std::env;
use std::fs;
use std::path::PathBuf;

fn main() {
    tauri_build::build();

    // Copy the appropriate PDFium library based on target platform
    let target = env::var("TARGET").unwrap_or_else(|_| {
        // Fallback for development: detect current platform
        if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
            "aarch64-apple-darwin".to_string()
        } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
            "x86_64-apple-darwin".to_string()
        } else if cfg!(target_os = "windows") {
            "x86_64-pc-windows-msvc".to_string()
        } else if cfg!(target_os = "linux") {
            "x86_64-unknown-linux-gnu".to_string()
        } else {
            "unknown".to_string()
        }
    });

    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let libs_dir = manifest_dir.join("libs");
    let out_dir = manifest_dir.join("resources");

    // Create resources directory if it doesn't exist
    fs::create_dir_all(&out_dir).expect("Failed to create resources directory");

    // Determine source directory and library name based on target
    let (src_dir, lib_name) = if target.contains("aarch64-apple-darwin") {
        // Check if we're building for universal (MACOSX_DEPLOYMENT_TARGET might be set)
        // or if universal library exists, prefer it for better compatibility
        let universal_path = libs_dir.join("macos-universal").join("libpdfium.dylib");
        if universal_path.exists() {
            ("macos-universal", "libpdfium.dylib")
        } else {
            ("macos-arm64", "libpdfium.dylib")
        }
    } else if target.contains("x86_64-apple-darwin") {
        // For x64, also prefer universal if available
        let universal_path = libs_dir.join("macos-universal").join("libpdfium.dylib");
        if universal_path.exists() {
            ("macos-universal", "libpdfium.dylib")
        } else {
            ("macos-x64", "libpdfium.dylib")
        }
    } else if target.contains("windows") {
        ("windows-x64", "pdfium.dll")
    } else if target.contains("linux") {
        ("linux-x64", "libpdfium.so")
    } else {
        println!(
            "cargo:warning=Unknown target: {}, skipping PDFium copy",
            target
        );
        return;
    };

    let src_path = libs_dir.join(src_dir).join(lib_name);
    let dst_path = out_dir.join(lib_name);

    if src_path.exists() {
        // Only copy if destination doesn't exist or has different size
        let should_copy = if dst_path.exists() {
            let src_meta = fs::metadata(&src_path).ok();
            let dst_meta = fs::metadata(&dst_path).ok();
            match (src_meta, dst_meta) {
                (Some(src), Some(dst)) => src.len() != dst.len(),
                _ => true,
            }
        } else {
            true
        };

        if should_copy {
            fs::copy(&src_path, &dst_path).expect("Failed to copy PDFium library");
            println!(
                "cargo:warning=Copied PDFium library from {} to {} (target: {})",
                src_path.display(),
                dst_path.display(),
                target
            );
        }
        println!("cargo:rerun-if-changed={}", src_path.display());
    } else {
        println!(
            "cargo:warning=PDFium library not found at {}. Run ./scripts/download-pdfium.sh first.",
            src_path.display()
        );
    }

    println!("cargo:rerun-if-changed=libs/");
}
