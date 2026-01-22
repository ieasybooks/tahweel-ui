# Changelog

All notable changes to Tahweel will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-01-22

### Changed
- Updated app logo with new design
- Removed app title text from header for cleaner UI
- Increased logo size in app from 64px to 96px

### Fixed
- Fixed release workflow to trigger on GitHub UI releases
- Fixed icon format to RGBA for Tauri build compatibility

## [0.1.0] - 2026-01-22

### Added

#### Core Features
- **PDF to Text Conversion**: Convert PDF files to editable text using Google Drive's OCR
- **Image OCR Support**: Extract text from JPG, JPEG, and PNG images
- **Multiple Output Formats**: Export to TXT, DOCX, and JSON formats
- **Batch Processing**: Convert entire folders of documents at once
- **Drag and Drop**: Drop files directly onto the app window to start conversion

#### Processing Pipeline
- PDF splitting using PDFium with configurable DPI (72-300)
- Parallel page rendering with Rayon for faster processing
- Concurrent OCR operations (1-20 simultaneous uploads) via Google Drive API
- Automatic retry with exponential backoff for API rate limits (429) and server errors (5xx)
- Cancellation support with proper cleanup of temporary and uploaded files

#### User Interface
- Clean, modern UI built with Vue 3 and Tailwind CSS
- Real-time progress tracking for both global and per-file progress
- Bilingual support: Arabic (RTL) and English (LTR)
- Settings panel with DPI, concurrency, and output format configuration
- Custom output directory selection

#### Output Features
- RTL text alignment detection for Arabic content in DOCX files
- Bidirectional text support in generated documents
- Line compacting algorithm for cleaner DOCX output
- Page separator configuration for multi-page documents

#### Authentication
- Google OAuth 2.0 integration for Drive API access
- Automatic token refresh for seamless long sessions
- Secure token storage in platform cache directory

#### Accessibility
- ARIA labels on all interactive elements
- Keyboard navigation support (Arrow keys, Enter, Escape)
- Focus indicators for better visibility
- Screen reader compatible with aria-live regions
- Semantic HTML structure (header, fieldset, legend)
- Progress bars with proper ARIA attributes

#### Error Handling
- Toast notification system for user-visible errors
- Graceful handling of partial OCR failures
- Session expiration notifications
- Detailed error messages in progress section

### Technical Details

#### Frontend
- Vue 3.5 with Composition API
- Pinia for state management with localStorage persistence
- vue-i18n for internationalization
- TypeScript for type safety
- Vitest for unit testing (190 tests)

#### Backend
- Tauri 2.0 framework
- Rust with async/await (Tokio runtime)
- pdfium-render for PDF processing
- reqwest for HTTP requests
- Comprehensive test coverage (120+ tests)

#### Supported Platforms
- macOS (Apple Silicon and Intel)
- Windows (x64)
- Linux (x64)

### Known Limitations

- Requires active internet connection for OCR (uses Google Drive API)
- Google account authentication required
- Large PDFs may consume significant memory during parallel processing
- OAuth credentials are bundled in the application binary

### Dependencies

#### Key Runtime Dependencies
- PDFium library (bundled per platform)
- Google Drive API v3

#### Development Dependencies
- Node.js 20+
- Rust 1.70+
- Platform-specific build tools (Xcode, Visual Studio, etc.)

[0.1.1]: https://github.com/ieasybooks/tahweel-ui/releases/tag/0.1.1
[0.1.0]: https://github.com/ieasybooks/tahweel-ui/releases/tag/0.1.0
