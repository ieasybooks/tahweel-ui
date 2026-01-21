# Code Review: Tahweel-Tauri

**Date:** 2026-01-21
**Reviewer:** Claude
**Version:** 0.1.0

---

## Executive Summary

Overall, the codebase is well-structured with clear separation of concerns between Vue components, composables, stores, and the Rust backend. The code follows modern patterns and conventions. Below are findings categorized by severity.

---

## Critical Issues

### 1. OAuth Credentials Embedded in Source Code
**File:** `src-tauri/src/auth.rs:6-8`
**Severity:** Critical (Security)

```rust
const CLIENT_ID: &str = "512416833080-...";
const CLIENT_SECRET: &str = "GOCSPX-...";
```

**Issue:** OAuth client secret is hardcoded in the source. While common for desktop apps (since they can't keep secrets), this secret could be extracted from the binary.

**Recommendation:**
- Use Google's "Desktop App" OAuth flow which doesn't require a client secret
- Or document this as an accepted risk for desktop applications

---

## High Priority Issues

### 2. No Cancellation Support for File Processing
**File:** `src/composables/useFileProcessor.ts`
**Severity:** High (UX)

**Issue:** Once file processing starts, there's no way to cancel it. Users must wait for completion.

**Recommendation:** Add an `AbortController` pattern:
```typescript
const abortController = ref<AbortController | null>(null);

async function processFiles(filePaths: string[], outputDir: string) {
  abortController.value = new AbortController();
  // Check abortController.value.signal.aborted in the loop
}

function cancelProcessing() {
  abortController.value?.abort();
}
```

### 3. Fragile Error Detection in Retry Logic
**File:** `src-tauri/src/google_drive.rs:176-182`
**Severity:** High (Reliability)

```rust
let is_retriable = e.contains("429")
    || e.contains("500")
    // ...
```

**Issue:** Error detection relies on string matching, which is fragile. If error message format changes, retries won't trigger.

**Recommendation:** Parse HTTP status codes directly from the response before converting to string error.

### 4. Memory-Intensive Parallel PDF Processing
**File:** `src-tauri/src/pdf.rs:127-178`
**Severity:** High (Performance)

**Issue:** Each parallel thread creates its own PDFium instance and loads the entire PDF. For a 100-page PDF, this means loading the PDF 100 times.

**Recommendation:** Consider chunked processing - divide pages into groups and process each chunk with a single PDFium instance.

---

## Medium Priority Issues

### 5. Potential Authentication State Inconsistency
**File:** `src/stores/auth.ts:17-21`
**Severity:** Medium (Logic)

```typescript
const isAuthenticated = computed(() => {
  if (!accessToken.value) return false;
  if (expiresAt.value && Date.now() >= expiresAt.value) return false;
  return true;
});
```

**Issue:** If `expiresAt` is `null` but `accessToken` exists, `isAuthenticated` returns `true`. This could lead to using stale tokens.

**Recommendation:** Require `expiresAt` to be set:
```typescript
if (!accessToken.value || !expiresAt.value) return false;
if (Date.now() >= expiresAt.value) return false;
```

### 6. Weak Random Number Generation for Jitter
**File:** `src-tauri/src/google_drive.rs:201-210`
**Severity:** Medium (Reliability)

```rust
pub fn random<T>() -> f64 {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .subsec_nanos();
    (nanos as f64 % 1000.0) / 1000.0
}
```

**Issue:** Custom random using nanoseconds can produce predictable sequences on fast systems.

**Recommendation:** Use the `rand` crate or accept this limitation for non-security-critical jitter.

### 7. Unused Generic Type Parameter
**File:** `src-tauri/src/google_drive.rs:204`
**Severity:** Medium (Code Quality)

```rust
pub fn random<T>() -> f64 {
```

**Issue:** The generic type parameter `<T>` is unused.

**Recommendation:** Remove it: `pub fn random() -> f64`

### 8. Missing Error Handling for Empty Results
**File:** `src/composables/useGoogleDriveOcr.ts:93-122`
**Severity:** Medium (Reliability)

**Issue:** If OCR fails for a page, the error is thrown but not gracefully handled. Consider returning partial results with errors.

---

## Low Priority Issues

### 9. Hardcoded DPI Multipliers
**File:** `src-tauri/src/pdf.rs:145-148`
**Severity:** Low (Maintainability)

```rust
let render_config = PdfRenderConfig::new()
    .set_target_width((dpi as i32) * 8)  // Magic numbers
    .set_maximum_height((dpi as i32) * 12)
```

**Recommendation:** Extract to named constants:
```rust
const PAGE_WIDTH_INCHES: i32 = 8;
const PAGE_HEIGHT_INCHES: i32 = 12;
```

### 10. Inconsistent Error Message Format
**Files:** Various
**Severity:** Low (Consistency)

Error messages use different formats:
- `"Failed to load PDF: {:?}"` (Rust debug format)
- `"File not found: {}"` (Plain format)
- `"Token refresh failed: {}"` (With prefix)

**Recommendation:** Standardize error message format across the codebase.

### 11. Missing Input Validation for File Extensions
**File:** `src/composables/useFileProcessor.ts:72-73`
**Severity:** Low (Robustness)

```typescript
const ext = entry.name.toLowerCase().match(/\.[^.]+$/)?.[0];
```

**Issue:** Files without extensions (rare but possible) return `undefined`.

**Recommendation:** Add explicit check or default value.

### 12. Compaction Algorithm Could Be Clearer
**File:** `src/composables/useWriters.ts:22-48`
**Severity:** Low (Readability)

**Issue:** The `compactText` algorithm is functional but the logic for `expectedLines` calculation could use clarification.

**Recommendation:** Add documentation explaining the algorithm's purpose and mechanics.

---

## Positive Findings

1. **Good separation of concerns** - Clear boundaries between UI, business logic, and backend
2. **Proper TypeScript typing** - Strong typing throughout the frontend
3. **Internationalization ready** - Full Arabic/English support with RTL handling
4. **Retry logic with exponential backoff** - Good resilience for API calls
5. **Settings persistence** - Auto-save with validation and clamping
6. **Clean Vue 3 Composition API usage** - Modern patterns with composables
7. **Proper cleanup** - Temp directories are cleaned up after processing

---

## Recommendations Summary

| Priority | Count | Key Action |
|----------|-------|------------|
| Critical | 1 | Review OAuth credential handling |
| High | 3 | Add cancellation, fix retry logic, optimize PDF memory |
| Medium | 4 | Fix auth state, improve random, cleanup unused code |
| Low | 4 | Add constants, standardize errors, improve validation |

---

## Test Coverage Recommendation

The codebase currently has no automated tests. Recommended test coverage:

### Frontend (Vitest)
- `useWriters.ts` - Pure functions (`isArabicText`, `compactText`)
- `stores/*.ts` - State management logic
- `useAuth.ts` - Token management (mocked backend)

### Backend (Rust)
- `auth.rs` - `extract_code` function
- `google_drive.rs` - Retry logic, MIME type detection
- `pdf.rs` - Library path finding (with mocks)

---

*This code review is based on static analysis. Runtime testing is recommended for validation.*
