import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useProcessingStore } from "../processing";

describe("useProcessingStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe("initial state", () => {
    it("starts not processing", () => {
      const store = useProcessingStore();
      expect(store.isProcessing).toBe(false);
    });

    it("starts with empty files array", () => {
      const store = useProcessingStore();
      expect(store.files).toEqual([]);
    });

    it("starts with zero counters", () => {
      const store = useProcessingStore();
      expect(store.currentFileIndex).toBe(0);
      expect(store.completedFiles).toBe(0);
      expect(store.totalFiles).toBe(0);
    });

    it("starts with no current file", () => {
      const store = useProcessingStore();
      expect(store.currentFile).toBeNull();
    });

    it("starts with empty errors", () => {
      const store = useProcessingStore();
      expect(store.errors).toEqual([]);
    });

    it("starts with lastCompleted false", () => {
      const store = useProcessingStore();
      expect(store.lastCompleted).toBe(false);
    });

    it("starts with null output folder", () => {
      const store = useProcessingStore();
      expect(store.outputFolder).toBeNull();
    });
  });

  describe("globalProgress", () => {
    it("returns 0 when no files", () => {
      const store = useProcessingStore();
      expect(store.globalProgress).toBe(0);
    });

    it("calculates progress correctly", () => {
      const store = useProcessingStore();
      store.startProcessing(["/file1.pdf", "/file2.pdf", "/file3.pdf", "/file4.pdf"], "/output");
      store.completeFile();
      expect(store.globalProgress).toBe(25); // 1/4 = 25%
    });

    it("returns 100 when all files complete", () => {
      const store = useProcessingStore();
      store.startProcessing(["/file1.pdf", "/file2.pdf"], "/output");
      store.completeFile();
      store.completeFile();
      expect(store.globalProgress).toBe(100);
    });

    it("rounds progress to nearest integer", () => {
      const store = useProcessingStore();
      store.startProcessing(["/f1", "/f2", "/f3"], "/output");
      store.completeFile();
      expect(store.globalProgress).toBe(33); // 1/3 = 33.33... rounded to 33
    });
  });

  describe("fileProgress", () => {
    it("returns 0 when no current file", () => {
      const store = useProcessingStore();
      expect(store.fileProgress).toBe(0);
    });

    it("returns current file percentage", () => {
      const store = useProcessingStore();
      store.updateFileProgress({
        filePath: "/file.pdf",
        fileName: "file.pdf",
        stage: "ocr",
        currentPage: 5,
        totalPages: 10,
        percentage: 50,
      });
      expect(store.fileProgress).toBe(50);
    });
  });

  describe("startProcessing", () => {
    it("sets isProcessing to true", () => {
      const store = useProcessingStore();
      store.startProcessing(["/file.pdf"], "/output");
      expect(store.isProcessing).toBe(true);
    });

    it("stores file paths", () => {
      const store = useProcessingStore();
      const files = ["/file1.pdf", "/file2.pdf"];
      store.startProcessing(files, "/output");
      expect(store.files).toEqual(files);
    });

    it("sets total files count", () => {
      const store = useProcessingStore();
      store.startProcessing(["/a", "/b", "/c"], "/output");
      expect(store.totalFiles).toBe(3);
    });

    it("resets counters", () => {
      const store = useProcessingStore();
      // Simulate previous processing
      store.startProcessing(["/old.pdf"], "/old-output");
      store.completeFile();

      // Start new processing
      store.startProcessing(["/new.pdf"], "/new-output");
      expect(store.currentFileIndex).toBe(0);
      expect(store.completedFiles).toBe(0);
    });

    it("clears previous errors", () => {
      const store = useProcessingStore();
      store.addError("/file.pdf", "Error");

      store.startProcessing(["/new.pdf"], "/output");
      expect(store.errors).toEqual([]);
    });

    it("sets output folder", () => {
      const store = useProcessingStore();
      store.startProcessing(["/file.pdf"], "/output/folder");
      expect(store.outputFolder).toBe("/output/folder");
    });

    it("resets lastCompleted flag", () => {
      const store = useProcessingStore();
      store.lastCompleted = true;

      store.startProcessing(["/file.pdf"], "/output");
      expect(store.lastCompleted).toBe(false);
    });
  });

  describe("updateFileProgress", () => {
    it("updates current file progress", () => {
      const store = useProcessingStore();
      const progress = {
        filePath: "/file.pdf",
        fileName: "file.pdf",
        stage: "splitting" as const,
        currentPage: 3,
        totalPages: 10,
        percentage: 30,
      };

      store.updateFileProgress(progress);

      expect(store.currentFile).toEqual(progress);
    });

    it("can update stage", () => {
      const store = useProcessingStore();
      store.updateFileProgress({
        filePath: "/file.pdf",
        fileName: "file.pdf",
        stage: "preparing",
        currentPage: 0,
        totalPages: 0,
        percentage: 0,
      });

      store.updateFileProgress({
        filePath: "/file.pdf",
        fileName: "file.pdf",
        stage: "ocr",
        currentPage: 1,
        totalPages: 5,
        percentage: 20,
      });

      expect(store.currentFile?.stage).toBe("ocr");
    });
  });

  describe("completeFile", () => {
    it("increments completed files count", () => {
      const store = useProcessingStore();
      store.startProcessing(["/a", "/b"], "/output");
      store.completeFile();
      expect(store.completedFiles).toBe(1);
    });

    it("increments current file index", () => {
      const store = useProcessingStore();
      store.startProcessing(["/a", "/b"], "/output");
      store.completeFile();
      expect(store.currentFileIndex).toBe(1);
    });
  });

  describe("addError", () => {
    it("adds error to errors array", () => {
      const store = useProcessingStore();
      store.addError("/file.pdf", "File not found");
      expect(store.errors).toEqual([{ file: "/file.pdf", error: "File not found" }]);
    });

    it("accumulates multiple errors", () => {
      const store = useProcessingStore();
      store.addError("/file1.pdf", "Error 1");
      store.addError("/file2.pdf", "Error 2");
      expect(store.errors).toHaveLength(2);
    });
  });

  describe("finishProcessing", () => {
    it("sets isProcessing to false", () => {
      const store = useProcessingStore();
      store.startProcessing(["/file.pdf"], "/output");
      store.finishProcessing();
      expect(store.isProcessing).toBe(false);
    });

    it("clears current file", () => {
      const store = useProcessingStore();
      store.startProcessing(["/file.pdf"], "/output");
      store.updateFileProgress({
        filePath: "/file.pdf",
        fileName: "file.pdf",
        stage: "done",
        currentPage: 10,
        totalPages: 10,
        percentage: 100,
      });
      store.finishProcessing();
      expect(store.currentFile).toBeNull();
    });

    it("sets lastCompleted to true", () => {
      const store = useProcessingStore();
      store.startProcessing(["/file.pdf"], "/output");
      store.finishProcessing();
      expect(store.lastCompleted).toBe(true);
    });
  });

  describe("reset", () => {
    it("resets all state to initial values", () => {
      const store = useProcessingStore();

      // Simulate full processing cycle
      store.startProcessing(["/file.pdf"], "/output");
      store.updateFileProgress({
        filePath: "/file.pdf",
        fileName: "file.pdf",
        stage: "ocr",
        currentPage: 5,
        totalPages: 10,
        percentage: 50,
      });
      store.addError("/file.pdf", "Error");
      store.completeFile();
      store.finishProcessing();

      // Reset
      store.reset();

      expect(store.isProcessing).toBe(false);
      expect(store.files).toEqual([]);
      expect(store.currentFileIndex).toBe(0);
      expect(store.currentFile).toBeNull();
      expect(store.completedFiles).toBe(0);
      expect(store.totalFiles).toBe(0);
      expect(store.errors).toEqual([]);
      expect(store.lastCompleted).toBe(false);
      expect(store.outputFolder).toBeNull();
    });
  });

  describe("processing workflow", () => {
    it("handles complete processing workflow", () => {
      const store = useProcessingStore();
      const files = ["/file1.pdf", "/file2.pdf"];

      // Start processing
      store.startProcessing(files, "/output");
      expect(store.isProcessing).toBe(true);
      expect(store.globalProgress).toBe(0);

      // Process file 1
      store.updateFileProgress({
        filePath: "/file1.pdf",
        fileName: "file1.pdf",
        stage: "preparing",
        currentPage: 0,
        totalPages: 0,
        percentage: 0,
      });
      expect(store.currentFile?.stage).toBe("preparing");

      store.updateFileProgress({
        filePath: "/file1.pdf",
        fileName: "file1.pdf",
        stage: "done",
        currentPage: 5,
        totalPages: 5,
        percentage: 100,
      });
      store.completeFile();
      expect(store.globalProgress).toBe(50);

      // Process file 2
      store.updateFileProgress({
        filePath: "/file2.pdf",
        fileName: "file2.pdf",
        stage: "done",
        currentPage: 3,
        totalPages: 3,
        percentage: 100,
      });
      store.completeFile();
      expect(store.globalProgress).toBe(100);

      // Finish
      store.finishProcessing();
      expect(store.isProcessing).toBe(false);
      expect(store.lastCompleted).toBe(true);
    });

    it("handles workflow with errors", () => {
      const store = useProcessingStore();

      store.startProcessing(["/file1.pdf", "/file2.pdf"], "/output");

      // File 1 fails
      store.addError("/file1.pdf", "OCR failed");
      store.completeFile(); // Still counts as "complete" (processed)

      // File 2 succeeds
      store.completeFile();

      store.finishProcessing();

      expect(store.errors).toHaveLength(1);
      expect(store.completedFiles).toBe(2);
      expect(store.lastCompleted).toBe(true);
    });
  });
});
