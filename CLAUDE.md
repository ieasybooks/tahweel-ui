# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tahweel is a Tauri 2.0 desktop app that performs OCR on PDFs and images using Google Drive's OCR. PDFs are split into PNG images using PDFium, uploaded to Google Drive as Google Docs (triggering OCR), exported as text, then written to output files.

## Commands

```bash
npm install              # Install dependencies
npm run tauri dev        # Development mode with hot reload
npm run tauri build      # Production build

npm run test             # Run frontend tests (Vitest)
npm run test:watch       # Tests in watch mode
cargo test               # Run Rust tests (from src-tauri/)

npm run lint             # ESLint
npm run format           # Prettier
npm run build            # Type-check + Vite build (frontend only)
```

## Architecture

### Processing Pipeline

1. User selects file(s) → `useFileProcessor.processFiles()`
2. For PDFs: `usePdfProcessor.splitPdf()` → Rust `split_pdf` renders pages to PNG via PDFium (parallel with Rayon)
3. OCR: `useGoogleDriveOcr.extractText()` → uploads images to Google Drive, exports as text, deletes files (concurrent via p-limit)
4. Output: `useWriters.writeOutputs()` → writes TXT/JSON/DOCX

### Rust Backend (src-tauri/src/)

| File | Purpose |
|------|---------|
| `lib.rs` | Tauri command registration, plugin setup |
| `auth.rs` | OAuth2 flow via local TCP server on port 3027, token storage in `~/.cache/tahweel/token.json` |
| `pdf.rs` | PDF rendering with pdfium-render, parallel page splitting with Rayon, emits `split-progress` events |
| `google_drive.rs` | Upload (multipart), export (as text), delete files; exponential backoff retry for 429/5xx errors |

### Vue Frontend (src/)

| Layer | Files | Purpose |
|-------|-------|---------|
| Stores | `stores/auth.ts`, `processing.ts`, `settings.ts` | Pinia state; settings auto-save to localStorage |
| Composables | `composables/useAuth.ts` | OAuth orchestration, token refresh |
| | `composables/useFileProcessor.ts` | Main processing orchestration, file validation |
| | `composables/usePdfProcessor.ts` | PDF splitting wrapper, progress event listener |
| | `composables/useGoogleDriveOcr.ts` | OCR with p-limit concurrency, cancellation support |
| | `composables/useWriters.ts` | TXT/JSON/DOCX output; Arabic detection for RTL alignment |
| Components | `components/*.vue` | UI components |

### Frontend-Backend Communication

- **invoke**: Call Rust commands (e.g., `invoke("split_pdf", { pdfPath, dpi, totalPages })`)
- **listen**: Subscribe to events from Rust (e.g., `listen("split-progress", callback)`)

## Key Implementation Details

### PDF Processing (pdf.rs)
- Uses pdfium-render crate (requires PDFium library in `src-tauri/resources/`)
- Parallel rendering with Rayon (each thread loads its own PDFium instance - not thread-safe)
- Page dimensions: DPI × 8" width, DPI × 12" height max
- Output format: PNG (lossless, better for OCR)

### Google Drive OCR (google_drive.rs)
- Uploads file as Google Doc with `mimeType: application/vnd.google-apps.document` (triggers OCR)
- Exports as `text/plain`
- Retry logic: exponential backoff (1.5^n seconds, max 15s) for 429, 5xx, timeouts

### OAuth (auth.rs)
- Starts TCP listener on `127.0.0.1:3027` before opening browser
- Scope: `https://www.googleapis.com/auth/drive.file`
- Tokens stored in platform cache directory

### Settings (stores/settings.ts)
- DPI: 72-300 (default 150)
- OCR Concurrency: 1-20 (default 12)
- Formats: txt, docx, json (default: txt, docx)
- Values are clamped on load to prevent tampered localStorage

### DOCX Generation (useWriters.ts)
- Arabic text detection via Unicode range `\u0600-\u06FF`
- RTL alignment and bidirectional text for Arabic content
- Line compacting algorithm merges short adjacent lines when page exceeds 40 effective lines

## Testing

- **Frontend**: Vitest with jsdom, tests in `__tests__/` directories
- **Rust**: Unit tests in source files, run with `cargo test` from `src-tauri/`
- Path alias `@` maps to `src/` in TypeScript

## Tauri Commands

Auth: `start_oauth_flow`, `refresh_access_token`, `load_stored_tokens`, `clear_auth_tokens`, `get_user_info`

PDF: `get_pdf_page_count`, `split_pdf`, `extract_pdf_page`, `cleanup_temp_dir`, `write_binary_file`

Google Drive: `upload_to_google_drive`, `export_google_doc_as_text`, `delete_google_drive_file`

Utility: `open_folder`
