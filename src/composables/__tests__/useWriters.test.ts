import { describe, it, expect, vi, beforeEach } from "vitest"
import type { OutputFormat } from "@/stores/settings"

// Mock Tauri APIs before importing useWriters
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}))

import { invoke } from "@tauri-apps/api/core"
import { useWriters } from "../useWriters"

describe("useWriters", () => {
  const { isArabicText, compactText, writeTxt, writeJson, writeOutputs } =
    useWriters()

  describe("isArabicText", () => {
    it("returns true for Arabic-only text", () => {
      expect(isArabicText("مرحبا بالعالم")).toBe(true)
    })

    it("returns true for predominantly Arabic text", () => {
      expect(isArabicText("مرحبا hello عالم")).toBe(true)
    })

    it("returns false for English-only text", () => {
      expect(isArabicText("Hello World")).toBe(false)
    })

    it("returns false for predominantly English text", () => {
      expect(isArabicText("Hello مرحبا World Test")).toBe(false)
    })

    it("returns false for empty string (no Arabic chars)", () => {
      expect(isArabicText("")).toBe(false)
    })

    it("returns true for numbers and Arabic", () => {
      expect(isArabicText("123 مرحبا 456")).toBe(true)
    })

    it("returns false for numbers only", () => {
      expect(isArabicText("123456")).toBe(false)
    })

    it("handles mixed content with punctuation", () => {
      expect(isArabicText("مرحبا! Hello?")).toBe(true) // More Arabic chars
    })
  })

  describe("compactText", () => {
    it("returns text unchanged if under 40 expected lines", () => {
      const shortText = Array(20).fill("Short line").join("\n")
      expect(compactText(shortText)).toBe(shortText)
    })

    it("merges shortest adjacent lines when over 40 lines", () => {
      const lines = Array(50)
        .fill("A")
        .map((_, i) => `Line ${i}`)
      const text = lines.join("\n")
      const compacted = compactText(text)
      const resultLines = compacted.split("\n")
      // Should have fewer lines than original
      expect(resultLines.length).toBeLessThan(lines.length)
    })

    it("handles single line input", () => {
      expect(compactText("Single line")).toBe("Single line")
    })

    it("handles empty input", () => {
      expect(compactText("")).toBe("")
    })

    it("accounts for long lines in expected count", () => {
      // Lines over 80 chars add to expected count
      const longLine = "A".repeat(100)
      const lines = [longLine, ...Array(35).fill("Short")]
      const text = lines.join("\n")
      const compacted = compactText(text)
      // Should trigger compaction due to long line
      expect(compacted.split("\n").length).toBeLessThanOrEqual(lines.length)
    })
  })

  describe("writeTxt", () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it("joins texts with default separator", async () => {
      const texts = ["Page 1", "Page 2", "Page 3"]

      await writeTxt(texts, "/output/test", {})

      expect(invoke).toHaveBeenCalledWith("write_text_file", {
        path: "/output/test.txt",
        content:
          "Page 1\n\nPAGE_SEPARATOR\n\nPage 2\n\nPAGE_SEPARATOR\n\nPage 3",
      })
    })

    it("uses custom page separator", async () => {
      const texts = ["Page 1", "Page 2"]

      await writeTxt(texts, "/output/test", { pageSeparator: "\n---\n" })

      expect(invoke).toHaveBeenCalledWith("write_text_file", {
        path: "/output/test.txt",
        content: "Page 1\n---\nPage 2",
      })
    })

    it("trims whitespace from texts", async () => {
      const texts = ["  Page 1  ", "\nPage 2\n"]

      await writeTxt(texts, "/output/test", {})

      expect(invoke).toHaveBeenCalledWith("write_text_file", {
        path: "/output/test.txt",
        content: "Page 1\n\nPAGE_SEPARATOR\n\nPage 2",
      })
    })
  })

  describe("writeJson", () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it("writes JSON with page numbers", async () => {
      const texts = ["Page 1 content", "Page 2 content"]

      await writeJson(texts, "/output/test")

      const expectedJson = JSON.stringify(
        [
          { page: 1, content: "Page 1 content" },
          { page: 2, content: "Page 2 content" },
        ],
        null,
        2,
      )

      expect(invoke).toHaveBeenCalledWith("write_text_file", {
        path: "/output/test.json",
        content: expectedJson,
      })
    })

    it("trims content in JSON output", async () => {
      const texts = ["  trimmed  "]

      await writeJson(texts, "/output/test")

      // Find the write_text_file call and parse its content
      const call = (invoke as ReturnType<typeof vi.fn>).mock.calls.find(
        ([cmd]) => cmd === "write_text_file",
      )
      expect(call).toBeDefined()
      const parsed = JSON.parse(call![1].content)
      expect(parsed[0].content).toBe("trimmed")
    })
  })

  describe("writeOutputs", () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it("writes only requested formats", async () => {
      const texts = ["Content"]

      await writeOutputs(texts, "/output/test", ["txt"] as OutputFormat[], {})

      const textFileCalls =
        (invoke as ReturnType<typeof vi.fn>).mock.calls.filter(
          ([cmd]) => cmd === "write_text_file",
        )
      expect(textFileCalls).toHaveLength(1)
      expect(textFileCalls[0][1]).toEqual({
        path: "/output/test.txt",
        content: "Content",
      })
    })

    it("writes multiple formats in parallel", async () => {
      const texts = ["Content"]

      await writeOutputs(
        texts,
        "/output/test",
        ["txt", "json"] as OutputFormat[],
        {},
      )

      const textFileCalls =
        (invoke as ReturnType<typeof vi.fn>).mock.calls.filter(
          ([cmd]) => cmd === "write_text_file",
        )
      expect(textFileCalls).toHaveLength(2)
    })

    it("handles empty formats array", async () => {
      const texts = ["Content"]

      await writeOutputs(texts, "/output/test", [], {})

      const textFileCalls =
        (invoke as ReturnType<typeof vi.fn>).mock.calls.filter(
          ([cmd]) => cmd === "write_text_file",
        )
      expect(textFileCalls).toHaveLength(0)
    })
  })
})
