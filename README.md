# Tahweel (تحويل)

A cross-platform desktop application for PDF/Image OCR using Google Drive API.

## Features

- **PDF to Text OCR** - Convert PDF files to TXT, DOCX, and JSON formats
- **Image OCR** - Support for JPG, JPEG, and PNG images
- **Arabic/RTL Support** - Full bilingual UI (Arabic and English) with RTL text detection in DOCX
- **Batch Processing** - Convert entire folders with directory structure preservation
- **Concurrent Processing** - Configurable concurrency for optimal performance
- **Cross-Platform** - Works on Windows, macOS, and Linux

## Prerequisites

### All Platforms

1. **Poppler utilities** - Required for PDF processing

   **macOS (Homebrew):**
   ```bash
   brew install poppler
   ```

   **Linux (Ubuntu/Debian):**
   ```bash
   sudo apt-get install poppler-utils
   ```

   **Windows:**
   Download from [poppler-windows releases](https://github.com/oschwartz10612/poppler-windows/releases) and add to PATH.

2. **Node.js** - Version 18 or higher
3. **Rust** - Version 1.70 or higher

### Optional: mise (recommended)

Use [mise](https://mise.jdx.dev/) for tool version management:
```bash
mise trust
mise install
```

## Development

### Install dependencies

```bash
npm install
```

### Run in development mode

```bash
npm run tauri dev
```

### Build for production

```bash
npm run tauri build
```

## Project Structure

```
tahweel-tauri/
├── src/                    # Vue frontend
│   ├── components/         # Vue components
│   ├── composables/        # Vue composables (hooks)
│   ├── stores/             # Pinia stores
│   ├── i18n/               # Internationalization
│   └── assets/             # CSS and assets
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── auth.rs         # OAuth authentication
│   │   ├── google_drive.rs # Google Drive API
│   │   ├── pdf.rs          # PDF processing with Poppler
│   │   └── lib.rs          # Tauri commands
│   └── tauri.conf.json     # Tauri configuration
├── public/                 # Static assets
└── package.json            # Node dependencies
```

## Technology Stack

### Frontend
- Vue 3 + TypeScript
- Vite (build tool)
- Tailwind CSS (styling)
- Pinia (state management)
- vue-i18n (internationalization)
- docx (DOCX generation)

### Backend
- Tauri 2.0 (Rust)
- Tokio (async runtime)
- Reqwest (HTTP client)
- Poppler (PDF processing)

## Configuration

Settings are persisted in localStorage and include:
- DPI for PDF rendering (72-300)
- Output formats (TXT, DOCX, JSON)
- OCR concurrency (1-20)
- Page separator for TXT output

## License

MIT
