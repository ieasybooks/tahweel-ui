# Tahweel (تحويل)

A cross-platform desktop application that converts PDF and image files to text using Google Drive's OCR capabilities.

## Features

- **PDF and Image OCR** - Convert PDF, JPG, JPEG, and PNG files to text
- **Multiple Output Formats** - TXT, DOCX (with RTL support), and JSON
- **Batch Processing** - Convert entire folders with all supported files
- **Bilingual UI** - Arabic (RTL) and English interfaces
- **Configurable Settings** - DPI (72-300), OCR concurrency (1-20), output formats

## How It Works

1. **PDF Splitting**: PDFs are rendered to PNG images using PDFium (one image per page)
2. **OCR via Google Drive**: Images are uploaded to Google Drive as Google Docs (which triggers OCR), then exported as plain text
3. **Output Generation**: Extracted text is written to the selected output formats

## Prerequisites

- **Node.js** 18+
- **Rust** 1.70+
- **PDFium library** - Must be placed in `src-tauri/resources/` as:
  - `libpdfium.dylib` (macOS)
  - `libpdfium.so` (Linux)
  - `pdfium.dll` (Windows)

Optional: Use [mise](https://mise.jdx.dev/) for tool version management (`mise install`).

## Development

```bash
npm install           # Install dependencies
npm run tauri dev     # Run in development mode
npm run tauri build   # Build for production
```

## Testing

```bash
npm run test          # Run frontend tests
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run tests with coverage
cargo test            # Run Rust tests (from src-tauri/)
```

## Project Structure

```
src/                      # Vue 3 frontend
├── components/           # UI components
├── composables/          # Business logic hooks
├── stores/               # Pinia state management
└── i18n/                 # Translations (ar/en)

src-tauri/src/            # Rust backend
├── lib.rs                # Tauri command registration
├── auth.rs               # Google OAuth2 flow
├── pdf.rs                # PDF rendering with PDFium
└── google_drive.rs       # Google Drive API operations
```

## Technology Stack

**Frontend**: Vue 3, TypeScript, Pinia, Tailwind CSS, vue-i18n, docx

**Backend**: Tauri 2.0, Rust, pdfium-render, Rayon, Tokio, Reqwest

## License

MIT
