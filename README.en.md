<p align="center">
  <img src="src/assets/logo.png" alt="Tahweel Logo" width="200" />
</p>

<h1 align="center">Tahweel Desktop (تطبيق تحويل)</h1>

<p align="center">
  <strong>Desktop application for converting PDF files and images to text using Google Drive OCR</strong>
</p>

<p align="center">
  <a href="https://github.com/ieasybooks/tahweel-tauri/releases/latest"><img src="https://img.shields.io/github/v/release/ieasybooks/tahweel-tauri" alt="Latest Release" /></a>
  <a href="https://github.com/ieasybooks/tahweel-tauri/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" /></a>
  <img src="https://img.shields.io/badge/tauri-v2-24C8DB.svg" alt="Tauri 2" />
  <img src="https://img.shields.io/badge/platforms-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey" alt="Platforms" />
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#how-it-works">How It Works</a> •
  <a href="#privacy-and-trust">Privacy &amp; Trust</a> •
  <a href="#development">Development</a> •
  <a href="#related-projects">Related Projects</a> •
  <a href="#contributing">Contributing</a>
</p>

<p align="center">
  <a href="README.md">🌐 العربية</a>
</p>

---

**Tahweel Desktop** is the cross-platform desktop application for the Tahweel project — a tool for converting PDF files and images to editable text formats using Google Drive's OCR. It's built with Tauri 2, Vue 3, and Rust, and shares the same OCR engine and output fidelity as the [Ruby gem](https://github.com/ieasybooks/tahweel.rb) and [Python implementation](https://github.com/ieasybooks/tahweel), wrapped in a native desktop UI with drag-and-drop, bilingual (Arabic/English) interface, and real-time progress tracking.

## Features

- 🔤 **High-Quality OCR** — Leverages Google Drive's OCR engine for accurate text extraction, especially strong on Arabic
- 📄 **Multiple Input Formats** — Supports PDF, JPG, JPEG, and PNG files
- 📝 **Multiple Output Formats** — Export to TXT, DOCX (with RTL support), or JSON
- 🌐 **Arabic Text Support** — Automatic right-to-left alignment detection for Arabic output
- ⚡ **Concurrent OCR** — Configurable OCR concurrency (1–20 parallel operations per file)
- 📊 **Real-Time Progress** — Global and per-file progress tracking with cancellation support
- 🖥️ **Cross-Platform** — Runs on macOS, Linux, and Windows as a native desktop app
- 🌍 **Bilingual UI** — Arabic (RTL) and English interfaces, switchable at runtime
- 🗂️ **Batch Processing** — Convert entire folders with all supported files at once
- 🖱️ **Drag &amp; Drop** — Drop files or folders anywhere in the window to start processing
- 🔒 **Hardened OAuth** — PKCE (RFC 7636) and `state` validation protect the sign-in flow
- 📂 **Auto-Open Output** — Automatically opens the output directory when conversion finishes

## How It Works

1. **PDF Splitting** — PDFs are rendered to PNG images locally using PDFium (one image per page). The original PDF never leaves your machine.
2. **OCR via Google Drive** — Each page image is uploaded to your own Google Drive as a temporary Google Doc, which triggers Google Drive's built-in OCR. The extracted text is exported back over HTTPS.
3. **Cleanup** — Temporary Google Docs are deleted from your Drive immediately after text extraction.
4. **Output Generation** — Extracted text is written to the selected output formats (TXT, DOCX, JSON) in your chosen output directory.

## Prerequisites

### Node.js

Requires **Node.js 18** or higher.

### Rust

Requires **Rust 1.70** or higher. Install via [rustup](https://rustup.rs/).

### PDFium Library

Tahweel Desktop uses [PDFium](https://pdfium.googlesource.com/pdfium/) for PDF rendering. The library must be placed in `src-tauri/resources/` as one of:

- `libpdfium.dylib` (macOS)
- `libpdfium.so` (Linux)
- `pdfium.dll` (Windows)

A helper script is provided to download prebuilt PDFium binaries:

```bash
./scripts/download-pdfium.sh
```

### Google Account

You'll need a Google account to authenticate with Google Drive's OCR service. The first time you sign in, a browser window will open for OAuth authentication.

### Optional: mise

If you use [mise](https://mise.jdx.dev/) for tool version management, run `mise install` to install the pinned Node.js and Rust versions from `mise.toml`.

## Installation

### From Releases

Download the latest installer for your platform from the [releases page](https://github.com/ieasybooks/tahweel-tauri/releases/latest):

- **macOS** — `.dmg` (Apple Silicon and Intel)
- **Linux** — `.AppImage` or `.deb`
- **Windows** — `.msi` installer

### From Source

```bash
git clone https://github.com/ieasybooks/tahweel-tauri.git
cd tahweel-tauri
npm install
./scripts/download-pdfium.sh
npm run tauri build
```

The built application will be in `src-tauri/target/release/bundle/`.

## Development

```bash
npm install           # Install frontend dependencies
npm run tauri dev     # Run in development mode (hot reload)
npm run tauri build   # Build for production
```

### Code Quality

```bash
npm run lint:check    # Lint (read-only)
npm run format:check  # Format check (read-only)
npm run build         # TypeScript type-check + Vite build
```

## Testing

```bash
npm run test          # Run frontend tests (Vitest)
npm run test:watch    # Tests in watch mode
npm run test:coverage # Tests with coverage report

cd src-tauri
cargo test            # Run Rust tests
```

## Privacy and Trust

Tahweel Desktop processes user documents and uploads them to a third-party service. Before using it, you should know exactly what happens to your files and credentials.

### What happens to your files

- **Local rendering first.** PDFs are rendered to PNG images locally, in-process, using PDFium. The original PDF never leaves your machine.
- **OCR via temporary Google Docs.** Each page image is uploaded to **your own** Google Drive as a temporary Google Doc with a random UUID as its name. Uploading as a Google Doc is what triggers Google Drive's built-in OCR. The extracted text is then exported back to your computer over HTTPS.
- **Best-effort cleanup.** Immediately after export, the app deletes the temporary Google Doc from your Drive. If deletion fails (network error, cancellation, app crash), the file remains in your Drive and you should manually remove it. Residual files are named with UUIDs and live at the root of your Drive, which makes them easy to find and delete.
- **No telemetry.** The app sends no analytics, crash reports, or usage data. The only network traffic is to Google's OAuth and Drive APIs during sign-in and OCR.

### What Google Drive permissions the app requests

Tahweel Desktop requests **only** the `https://www.googleapis.com/auth/drive.file` scope. Per Google's documentation, this scope grants access **only to files the app itself creates** — it cannot read, modify, list, or even see any pre-existing files or folders in your Drive. If you sign Tahweel in to a Drive account that already contains your personal files, the app has no way to reach them.

### How sign-in is hardened

The OAuth flow implements two defenses standard for desktop/installed apps:

- **PKCE** (Proof Key for Code Exchange, [RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636)) — each sign-in generates a fresh random `code_verifier` and sends only the SHA-256 hash (the `code_challenge`) to Google. The verifier is sent later when exchanging the authorization code for tokens, proving the app that completes the exchange is the same one that started the flow. This protects against authorization codes being intercepted or replayed.
- **State validation** — each sign-in generates a fresh random `state` parameter and verifies it matches when the callback arrives. Any callback with a missing or mismatched state is rejected with a 400 response, and the listener keeps waiting for the legitimate callback — preventing a local attacker from forging or cancelling a sign-in flow.

The OAuth `client_secret` embedded in the application binary is **not a real secret** — this is standard for installed applications and is publicly documented by Google. PKCE provides the actual security; the embedded identifier just names the OAuth client.

### Where tokens are stored

After sign-in, the access token and refresh token are stored as a plaintext JSON file in your operating system's user cache directory:

| OS | Path |
|---|---|
| macOS | `~/Library/Caches/tahweel/token.json` |
| Linux | `~/.cache/tahweel/token.json` |
| Windows | `%LOCALAPPDATA%\tahweel\token.json` |

This file contains your refresh token, which grants continued access to the `drive.file`-scoped resources without re-prompting. Sign out in the app to delete it. Future versions may migrate this to the OS-native credential store (Keychain on macOS, Credential Manager on Windows, Secret Service on Linux).

### What "sign out" does

Clicking sign out in the app clears the tokens from memory and deletes the local `token.json` file. It does not currently revoke the tokens at Google's end — if you want to fully revoke Tahweel's access to your Drive, visit [Google Account → Security → Third-party apps with account access](https://myaccount.google.com/permissions).

## Project Structure

```
src/                      # Vue 3 frontend
├── components/           # UI components
├── composables/          # Business logic hooks
├── stores/               # Pinia state management
├── i18n/                 # Translations (ar/en)
└── assets/               # Static assets

src-tauri/src/            # Rust backend
├── lib.rs                # Tauri command registration
├── auth.rs               # Google OAuth2 flow (PKCE + state)
├── pdf.rs                # PDF rendering with PDFium
└── google_drive.rs       # Google Drive API operations

scripts/                  # Build helpers
```

## Technology Stack

**Frontend:** Vue 3, TypeScript, Pinia, Tailwind CSS, vue-i18n, docx

**Backend:** Tauri 2.0, Rust, pdfium-render, Rayon, Tokio, Reqwest

## Related Projects

- 🐍 [ieasybooks/tahweel](https://github.com/ieasybooks/tahweel) — The original Python implementation
- 💎 [ieasybooks/tahweel.rb](https://github.com/ieasybooks/tahweel.rb) — Ruby gem and command-line interface
- 🌐 [ieasybooks/tahweel-website](https://github.com/ieasybooks/tahweel-website) — Official website

## Contributing

Bug reports and pull requests are welcome on GitHub at https://github.com/ieasybooks/tahweel-tauri.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -am 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Before submitting, please make sure:

```bash
npm run test          # Frontend tests pass
cd src-tauri && cargo test  # Rust tests pass
npm run lint:check    # No lint warnings
npm run format:check  # Code is formatted
```

## License

This application is available as open source under the terms of the [MIT License](https://opensource.org/licenses/MIT).

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/ieasybooks">iEasyBooks</a>
</p>
