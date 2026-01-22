import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(globalThis, "localStorage", { value: localStorageMock });

// Use vi.hoisted to define mocks that can be used in vi.mock factories
const { mockSplitPdf, mockExtractText, mockWriteOutputs, mockCleanupTempDir } = vi.hoisted(() => ({
  mockSplitPdf: vi.fn(),
  mockExtractText: vi.fn(),
  mockWriteOutputs: vi.fn(),
  mockCleanupTempDir: vi.fn(),
}));

// Mock all Tauri APIs and dependencies
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  message: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  readDir: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/path", () => ({
  dirname: vi.fn(),
  basename: vi.fn(),
  join: vi.fn(),
}));

vi.mock("vue-i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

// Mock composables
vi.mock("../usePdfProcessor", () => ({
  usePdfProcessor: () => ({
    splitPdf: mockSplitPdf,
  }),
  cleanupTempDir: mockCleanupTempDir,
}));

vi.mock("../useGoogleDriveOcr", () => ({
  useGoogleDriveOcr: () => ({
    extractText: mockExtractText,
  }),
}));

vi.mock("../useWriters", () => ({
  useWriters: () => ({
    writeOutputs: mockWriteOutputs,
  }),
}));

import { useFileProcessor } from "../useFileProcessor";
import { useProcessingStore } from "@/stores/processing";
import { useSettingsStore } from "@/stores/settings";
import { useAuthStore } from "@/stores/auth";
import { open, message } from "@tauri-apps/plugin-dialog";
import { readDir } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { dirname, basename, join } from "@tauri-apps/api/path";

describe("useFileProcessor", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();

    // Default mock implementations
    vi.mocked(dirname).mockImplementation(async (path: string) => {
      const parts = path.split("/");
      parts.pop();
      return parts.join("/") || "/";
    });

    vi.mocked(basename).mockImplementation(async (path: string) => {
      const parts = path.split("/");
      return parts[parts.length - 1];
    });

    vi.mocked(join).mockImplementation(async (...parts: string[]) => {
      return parts.join("/");
    });

    mockExtractText.mockResolvedValue(["Extracted text"]);
    mockWriteOutputs.mockResolvedValue(undefined);
    mockCleanupTempDir.mockResolvedValue(undefined);
  });

  describe("selectFile", () => {
    it("does nothing when no file selected", async () => {
      vi.mocked(open).mockResolvedValue(null);

      const { selectFile } = useFileProcessor();
      await selectFile();

      expect(mockExtractText).not.toHaveBeenCalled();
    });

    it("processes selected file when authenticated", async () => {
      const authStore = useAuthStore();
      authStore.setTokens({
        accessToken: "token",
        refreshToken: "refresh",
        expiresAt: Date.now() + 3600000,
      });

      vi.mocked(open).mockResolvedValue("/path/to/image.png");
      vi.mocked(invoke).mockResolvedValue(undefined);

      const { selectFile } = useFileProcessor();
      await selectFile();

      expect(mockExtractText).toHaveBeenCalled();
    });

    it("shows auth error when not authenticated", async () => {
      vi.mocked(open).mockResolvedValue("/path/to/image.png");
      vi.mocked(message).mockResolvedValue(undefined);

      const { selectFile } = useFileProcessor();
      await selectFile();

      expect(message).toHaveBeenCalledWith("messages.authRequired", {
        title: "messages.errorTitle",
        kind: "error",
      });
    });

    it("uses settings output directory when set", async () => {
      const authStore = useAuthStore();
      authStore.setTokens({
        accessToken: "token",
        refreshToken: "refresh",
        expiresAt: Date.now() + 3600000,
      });

      const settingsStore = useSettingsStore();
      settingsStore.outputDirectory = "/custom/output";

      vi.mocked(open).mockResolvedValue("/path/to/image.png");
      vi.mocked(invoke).mockResolvedValue(undefined);

      const { selectFile } = useFileProcessor();
      await selectFile();

      const processingStore = useProcessingStore();
      expect(processingStore.outputFolder).toBe("/custom/output");
    });
  });

  describe("selectFolder", () => {
    it("does nothing when no folder selected", async () => {
      vi.mocked(open).mockResolvedValue(null);

      const { selectFolder } = useFileProcessor();
      await selectFolder();

      expect(readDir).not.toHaveBeenCalled();
    });

    it("shows error when no supported files found", async () => {
      vi.mocked(open).mockResolvedValue("/empty/folder");
      vi.mocked(readDir).mockResolvedValue([
        { name: "readme.txt", isFile: true, isDirectory: false, isSymlink: false },
      ]);
      vi.mocked(message).mockResolvedValue(undefined);

      const { selectFolder } = useFileProcessor();
      await selectFolder();

      expect(message).toHaveBeenCalledWith("messages.noFiles", {
        title: "messages.errorTitle",
        kind: "error",
      });
    });

    it("processes supported files from folder", async () => {
      const authStore = useAuthStore();
      authStore.setTokens({
        accessToken: "token",
        refreshToken: "refresh",
        expiresAt: Date.now() + 3600000,
      });

      vi.mocked(open).mockResolvedValue("/folder");
      vi.mocked(readDir).mockResolvedValue([
        { name: "image.png", isFile: true, isDirectory: false, isSymlink: false },
        { name: "doc.pdf", isFile: true, isDirectory: false, isSymlink: false },
      ]);
      vi.mocked(invoke).mockResolvedValue(undefined);

      const { selectFolder } = useFileProcessor();
      await selectFolder();

      const processingStore = useProcessingStore();
      expect(processingStore.totalFiles).toBe(2);
    });
  });

  describe("collectFiles", () => {
    it("collects supported files from folder", async () => {
      vi.mocked(readDir).mockResolvedValue([
        { name: "image.png", isFile: true, isDirectory: false, isSymlink: false },
        { name: "doc.pdf", isFile: true, isDirectory: false, isSymlink: false },
        { name: "text.txt", isFile: true, isDirectory: false, isSymlink: false },
      ]);

      const { collectFiles } = useFileProcessor();
      const files = await collectFiles("/folder");

      expect(files).toHaveLength(2);
      expect(files).toContain("/folder/image.png");
      expect(files).toContain("/folder/doc.pdf");
    });

    it("recursively scans subdirectories", async () => {
      vi.mocked(readDir).mockImplementation(async (dir: string) => {
        if (dir === "/folder") {
          return [
            { name: "sub", isFile: false, isDirectory: true, isSymlink: false },
            { name: "root.pdf", isFile: true, isDirectory: false, isSymlink: false },
          ];
        }
        if (dir === "/folder/sub") {
          return [
            { name: "nested.png", isFile: true, isDirectory: false, isSymlink: false },
          ];
        }
        return [];
      });

      const { collectFiles } = useFileProcessor();
      const files = await collectFiles("/folder");

      expect(files).toHaveLength(2);
      expect(files).toContain("/folder/root.pdf");
      expect(files).toContain("/folder/sub/nested.png");
    });

    it("filters by supported extensions", async () => {
      vi.mocked(readDir).mockResolvedValue([
        { name: "image.PNG", isFile: true, isDirectory: false, isSymlink: false },
        { name: "photo.jpg", isFile: true, isDirectory: false, isSymlink: false },
        { name: "photo.jpeg", isFile: true, isDirectory: false, isSymlink: false },
        { name: "doc.PDF", isFile: true, isDirectory: false, isSymlink: false },
        { name: "unsupported.gif", isFile: true, isDirectory: false, isSymlink: false },
      ]);

      const { collectFiles } = useFileProcessor();
      const files = await collectFiles("/folder");

      expect(files).toHaveLength(4);
    });

    it("returns sorted file list", async () => {
      vi.mocked(readDir).mockResolvedValue([
        { name: "c.pdf", isFile: true, isDirectory: false, isSymlink: false },
        { name: "a.pdf", isFile: true, isDirectory: false, isSymlink: false },
        { name: "b.pdf", isFile: true, isDirectory: false, isSymlink: false },
      ]);

      const { collectFiles } = useFileProcessor();
      const files = await collectFiles("/folder");

      expect(files).toEqual(["/folder/a.pdf", "/folder/b.pdf", "/folder/c.pdf"]);
    });
  });

  describe("processFiles", () => {
    beforeEach(() => {
      const authStore = useAuthStore();
      authStore.setTokens({
        accessToken: "token",
        refreshToken: "refresh",
        expiresAt: Date.now() + 3600000,
      });
    });

    it("processes image files directly", async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);

      const { processFiles } = useFileProcessor();
      await processFiles(["/path/to/image.png"], "/output");

      expect(mockExtractText).toHaveBeenCalledWith(
        ["/path/to/image.png"],
        expect.any(Number),
        expect.any(Function)
      );
      expect(mockSplitPdf).not.toHaveBeenCalled();
    });

    it("splits PDF before processing", async () => {
      mockSplitPdf.mockResolvedValue({
        imagePaths: ["/tmp/page1.png", "/tmp/page2.png"],
        tempDir: "/tmp/split",
      });
      vi.mocked(invoke).mockResolvedValue(undefined);

      const { processFiles } = useFileProcessor();
      await processFiles(["/path/to/doc.pdf"], "/output");

      expect(mockSplitPdf).toHaveBeenCalled();
      expect(mockExtractText).toHaveBeenCalledWith(
        ["/tmp/page1.png", "/tmp/page2.png"],
        expect.any(Number),
        expect.any(Function)
      );
    });

    it("cleans up temp directory after PDF processing", async () => {
      mockSplitPdf.mockResolvedValue({
        imagePaths: ["/tmp/page1.png"],
        tempDir: "/tmp/split",
      });
      vi.mocked(invoke).mockResolvedValue(undefined);

      const { processFiles } = useFileProcessor();
      await processFiles(["/path/to/doc.pdf"], "/output");

      expect(mockCleanupTempDir).toHaveBeenCalledWith("/tmp/split");
    });

    it("writes outputs in configured formats", async () => {
      const settingsStore = useSettingsStore();
      settingsStore.formats = ["txt", "docx"];
      vi.mocked(invoke).mockResolvedValue(undefined);

      const { processFiles } = useFileProcessor();
      await processFiles(["/path/to/image.png"], "/output");

      expect(mockWriteOutputs).toHaveBeenCalledWith(
        expect.any(Array),
        "/output/image",
        ["txt", "docx"],
        expect.any(Object)
      );
    });

    it("updates processing store progress", async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);

      const { processFiles } = useFileProcessor();
      await processFiles(["/path/to/image.png"], "/output");

      const store = useProcessingStore();
      expect(store.completedFiles).toBe(1);
    });

    it("handles processing errors gracefully", async () => {
      mockExtractText.mockRejectedValueOnce(new Error("OCR failed"));
      vi.mocked(invoke).mockResolvedValue(undefined);

      const { processFiles } = useFileProcessor();
      await processFiles(["/path/to/image.png"], "/output");

      const store = useProcessingStore();
      expect(store.errors).toHaveLength(1);
      expect(store.errors[0].error).toContain("OCR failed");
    });

    it("stops processing when cancelled", async () => {
      mockExtractText.mockRejectedValue(new Error("Processing cancelled"));
      vi.mocked(invoke).mockResolvedValue(undefined);

      const { processFiles } = useFileProcessor();
      await processFiles(["/path/to/file1.png", "/path/to/file2.png"], "/output");

      // Should have stopped after first file
      expect(mockWriteOutputs).not.toHaveBeenCalled();
    });

    it("opens output folder after completion", async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);

      const { processFiles } = useFileProcessor();
      await processFiles(["/path/to/image.png"], "/output");

      expect(invoke).toHaveBeenCalledWith("open_folder", { path: "/output" });
    });

    it("does not open folder when cancelled", async () => {
      const store = useProcessingStore();

      mockExtractText.mockImplementation(async () => {
        store.cancelProcessing();
        throw new Error("cancelled");
      });

      const { processFiles } = useFileProcessor();
      await processFiles(["/path/to/image.png"], "/output");

      expect(invoke).not.toHaveBeenCalledWith("open_folder", expect.any(Object));
    });

    it("cleans up temp dir on cancellation", async () => {
      const store = useProcessingStore();

      mockSplitPdf.mockResolvedValue({
        imagePaths: ["/tmp/page1.png"],
        tempDir: "/tmp/split",
      });

      mockExtractText.mockImplementation(async () => {
        store.cancelProcessing();
        throw new Error("cancelled");
      });

      const { processFiles } = useFileProcessor();
      await processFiles(["/path/to/doc.pdf"], "/output");

      expect(mockCleanupTempDir).toHaveBeenCalledWith("/tmp/split");
    });
  });

  describe("cancelProcessing", () => {
    it("sets cancelled flag in store", () => {
      const { cancelProcessing } = useFileProcessor();
      const store = useProcessingStore();

      store.startProcessing(["/file.png"], "/output");
      cancelProcessing();

      expect(store.isCancelled).toBe(true);
    });
  });
});

// Test the helper functions that are module-scoped
describe("file extension helpers", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("handles files with no extension", async () => {
    vi.mocked(readDir).mockResolvedValue([
      { name: "noext", isFile: true, isDirectory: false, isSymlink: false },
    ]);

    const { collectFiles } = useFileProcessor();
    const files = await collectFiles("/folder");

    expect(files).toHaveLength(0);
  });

  it("handles hidden files", async () => {
    vi.mocked(readDir).mockResolvedValue([
      { name: ".hidden", isFile: true, isDirectory: false, isSymlink: false },
      { name: ".hidden.pdf", isFile: true, isDirectory: false, isSymlink: false },
    ]);

    const { collectFiles } = useFileProcessor();
    const files = await collectFiles("/folder");

    // .hidden has no extension (dot at start), .hidden.pdf has .pdf extension
    expect(files).toHaveLength(1);
    expect(files[0]).toContain(".hidden.pdf");
  });

  it("handles files with trailing dot", async () => {
    vi.mocked(readDir).mockResolvedValue([
      { name: "file.", isFile: true, isDirectory: false, isSymlink: false },
    ]);

    const { collectFiles } = useFileProcessor();
    const files = await collectFiles("/folder");

    expect(files).toHaveLength(0);
  });
});
