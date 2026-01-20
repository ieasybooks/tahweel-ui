#!/bin/bash
# Download PDFium binaries for all platforms
# Run this script from the project root directory

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LIBS_DIR="$PROJECT_ROOT/src-tauri/libs"

echo "Downloading PDFium binaries..."

# Create directories
mkdir -p "$LIBS_DIR/macos-arm64"
mkdir -p "$LIBS_DIR/macos-x64"
mkdir -p "$LIBS_DIR/macos-universal"
mkdir -p "$LIBS_DIR/windows-x64"
mkdir -p "$LIBS_DIR/linux-x64"

# Download macOS ARM64
echo "Downloading PDFium for macOS ARM64..."
curl -sL "https://github.com/bblanchon/pdfium-binaries/releases/latest/download/pdfium-mac-arm64.tgz" | \
    tar -xz -C "$LIBS_DIR/macos-arm64" --strip-components=0
mv "$LIBS_DIR/macos-arm64/lib/libpdfium.dylib" "$LIBS_DIR/macos-arm64/"
rm -rf "$LIBS_DIR/macos-arm64/lib" "$LIBS_DIR/macos-arm64/include" "$LIBS_DIR/macos-arm64/licenses" \
    "$LIBS_DIR/macos-arm64"/*.cmake "$LIBS_DIR/macos-arm64"/*.gn "$LIBS_DIR/macos-arm64/VERSION" \
    "$LIBS_DIR/macos-arm64/LICENSE" 2>/dev/null || true

# Download macOS x64
echo "Downloading PDFium for macOS x64..."
curl -sL "https://github.com/bblanchon/pdfium-binaries/releases/latest/download/pdfium-mac-x64.tgz" | \
    tar -xz -C "$LIBS_DIR/macos-x64" --strip-components=0
mv "$LIBS_DIR/macos-x64/lib/libpdfium.dylib" "$LIBS_DIR/macos-x64/"
rm -rf "$LIBS_DIR/macos-x64/lib" "$LIBS_DIR/macos-x64/include" "$LIBS_DIR/macos-x64/licenses" \
    "$LIBS_DIR/macos-x64"/*.cmake "$LIBS_DIR/macos-x64"/*.gn "$LIBS_DIR/macos-x64/VERSION" \
    "$LIBS_DIR/macos-x64/LICENSE" 2>/dev/null || true

# Create universal macOS binary using lipo
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "Creating universal macOS PDFium library..."
    lipo -create \
        "$LIBS_DIR/macos-arm64/libpdfium.dylib" \
        "$LIBS_DIR/macos-x64/libpdfium.dylib" \
        -output "$LIBS_DIR/macos-universal/libpdfium.dylib"
    echo "Universal library created successfully!"
fi

# Download Windows x64
echo "Downloading PDFium for Windows x64..."
curl -sL "https://github.com/bblanchon/pdfium-binaries/releases/latest/download/pdfium-win-x64.tgz" | \
    tar -xz -C "$LIBS_DIR/windows-x64" --strip-components=0
mv "$LIBS_DIR/windows-x64/bin/pdfium.dll" "$LIBS_DIR/windows-x64/"
rm -rf "$LIBS_DIR/windows-x64/bin" "$LIBS_DIR/windows-x64/lib" "$LIBS_DIR/windows-x64/include" \
    "$LIBS_DIR/windows-x64/licenses" "$LIBS_DIR/windows-x64"/*.cmake "$LIBS_DIR/windows-x64"/*.gn \
    "$LIBS_DIR/windows-x64/VERSION" "$LIBS_DIR/windows-x64/LICENSE" 2>/dev/null || true

# Download Linux x64
echo "Downloading PDFium for Linux x64..."
curl -sL "https://github.com/bblanchon/pdfium-binaries/releases/latest/download/pdfium-linux-x64.tgz" | \
    tar -xz -C "$LIBS_DIR/linux-x64" --strip-components=0
mv "$LIBS_DIR/linux-x64/lib/libpdfium.so" "$LIBS_DIR/linux-x64/"
rm -rf "$LIBS_DIR/linux-x64/lib" "$LIBS_DIR/linux-x64/include" "$LIBS_DIR/linux-x64/licenses" \
    "$LIBS_DIR/linux-x64"/*.cmake "$LIBS_DIR/linux-x64"/*.gn "$LIBS_DIR/linux-x64/VERSION" \
    "$LIBS_DIR/linux-x64/LICENSE" 2>/dev/null || true

echo ""
echo "PDFium binaries downloaded successfully!"
echo ""
du -sh "$LIBS_DIR"/*
