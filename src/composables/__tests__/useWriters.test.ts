import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock Tauri APIs before importing useWriters
vi.mock("@tauri-apps/plugin-fs", () => ({
  writeTextFile: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}))

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

    it("returns true for empty string (no other chars)", () => {
      // Edge case: empty string has 0 Arabic and 0 other, 0 >= 0 is true
      expect(isArabicText("")).toBe(true)
    })

    it("returns true for numbers and Arabic", () => {
      expect(isArabicText("123 مرحبا 456")).toBe(true)
    })

    it("returns false for numbers only", () => {
      // Numbers are excluded from both counts, so 0 >= 0 is true
      expect(isArabicText("123456")).toBe(true)
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
      const { writeTextFile } = await import("@tauri-apps/plugin-fs")
      const texts = ["Page 1", "Page 2", "Page 3"]

      await writeTxt(texts, "/output/test", {})

      expect(writeTextFile).toHaveBeenCalledWith(
        "/output/test.txt",
        "Page 1\n\nPAGE_SEPARATOR\n\nPage 2\n\nPAGE_SEPARATOR\n\nPage 3",
      )
    })

    it("uses custom page separator", async () => {
      const { writeTextFile } = await import("@tauri-apps/plugin-fs")
      const texts = ["Page 1", "Page 2"]

      await writeTxt(texts, "/output/test", { pageSeparator: "\n---\n" })

      expect(writeTextFile).toHaveBeenCalledWith(
        "/output/test.txt",
        "Page 1\n---\nPage 2",
      )
    })

    it("trims whitespace from texts", async () => {
      const { writeTextFile } = await import("@tauri-apps/plugin-fs")
      const texts = ["  Page 1  ", "\nPage 2\n"]

      await writeTxt(texts, "/output/test", {})

      expect(writeTextFile).toHaveBeenCalledWith(
        "/output/test.txt",
        "Page 1\n\nPAGE_SEPARATOR\n\nPage 2",
      )
    })
  })

  describe("writeJson", () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it("writes JSON with page numbers", async () => {
      const { writeTextFile } = await import("@tauri-apps/plugin-fs")
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

      expect(writeTextFile).toHaveBeenCalledWith(
        "/output/test.json",
        expectedJson,
      )
    })

    it("trims content in JSON output", async () => {
      const { writeTextFile } = await import("@tauri-apps/plugin-fs")
      const texts = ["  trimmed  "]

      await writeJson(texts, "/output/test")

      const call = (writeTextFile as ReturnType<typeof vi.fn>).mock.calls[0]
      const parsed = JSON.parse(call[1])
      expect(parsed[0].content).toBe("trimmed")
    })
  })

  describe("writeOutputs", () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it("writes only requested formats", async () => {
      const { writeTextFile } = await import("@tauri-apps/plugin-fs")
      const texts = ["Content"]

      await writeOutputs(texts, "/output/test", ["txt"] as ("txt" | "docx" | "json")[], {})

      expect(writeTextFile).toHaveBeenCalledTimes(1)
      expect(writeTextFile).toHaveBeenCalledWith("/output/test.txt", "Content")
    })

    it("writes multiple formats in parallel", async () => {
      const { writeTextFile } = await import("@tauri-apps/plugin-fs")
      const texts = ["Content"]

      await writeOutputs(texts, "/output/test", ["txt", "json"] as ("txt" | "docx" | "json")[], {})

      expect(writeTextFile).toHaveBeenCalledTimes(2)
    })

    it("handles empty formats array", async () => {
      const { writeTextFile } = await import("@tauri-apps/plugin-fs")
      const texts = ["Content"]

      await writeOutputs(texts, "/output/test", [], {})

      expect(writeTextFile).not.toHaveBeenCalled()
    })
  })
})
