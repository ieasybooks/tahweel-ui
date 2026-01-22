import { describe, it, expect, beforeEach, vi } from "vitest"
import { setActivePinia, createPinia } from "pinia"

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    clear: vi.fn(() => {
      store = {}
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
  }
})()

Object.defineProperty(global, "localStorage", {
  value: localStorageMock,
})

import { useSettingsStore } from "../settings"

describe("useSettingsStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  describe("default values", () => {
    it("has default DPI of 150", () => {
      const store = useSettingsStore()
      expect(store.dpi).toBe(150)
    })

    it("has default formats of txt and docx", () => {
      const store = useSettingsStore()
      expect(store.formats).toEqual(["txt", "docx"])
    })

    it("has default OCR concurrency of 12", () => {
      const store = useSettingsStore()
      expect(store.ocrConcurrency).toBe(12)
    })

    it("has default page separator", () => {
      const store = useSettingsStore()
      expect(store.pageSeparator).toBe("\n\nPAGE_SEPARATOR\n\n")
    })

    it("has null output directory by default", () => {
      const store = useSettingsStore()
      expect(store.outputDirectory).toBeNull()
    })
  })

  describe("setDpi", () => {
    it("sets valid DPI value", () => {
      const store = useSettingsStore()
      store.setDpi(200)
      expect(store.dpi).toBe(200)
    })

    it("clamps DPI below minimum to 72", () => {
      const store = useSettingsStore()
      store.setDpi(50)
      expect(store.dpi).toBe(72)
    })

    it("clamps DPI above maximum to 300", () => {
      const store = useSettingsStore()
      store.setDpi(500)
      expect(store.dpi).toBe(300)
    })

    it("clamps DPI at minimum boundary", () => {
      const store = useSettingsStore()
      store.setDpi(72)
      expect(store.dpi).toBe(72)
    })

    it("clamps DPI at maximum boundary", () => {
      const store = useSettingsStore()
      store.setDpi(300)
      expect(store.dpi).toBe(300)
    })
  })

  describe("setOcrConcurrency", () => {
    it("sets valid concurrency value", () => {
      const store = useSettingsStore()
      store.setOcrConcurrency(8)
      expect(store.ocrConcurrency).toBe(8)
    })

    it("clamps concurrency below minimum to 1", () => {
      const store = useSettingsStore()
      store.setOcrConcurrency(0)
      expect(store.ocrConcurrency).toBe(1)
    })

    it("clamps concurrency above maximum to 20", () => {
      const store = useSettingsStore()
      store.setOcrConcurrency(50)
      expect(store.ocrConcurrency).toBe(20)
    })

    it("handles negative values", () => {
      const store = useSettingsStore()
      store.setOcrConcurrency(-5)
      expect(store.ocrConcurrency).toBe(1)
    })
  })

  describe("setOutputDirectory", () => {
    it("sets output directory path", () => {
      const store = useSettingsStore()
      store.setOutputDirectory("/path/to/output")
      expect(store.outputDirectory).toBe("/path/to/output")
    })

    it("clears output directory with null", () => {
      const store = useSettingsStore()
      store.setOutputDirectory("/path/to/output")
      store.setOutputDirectory(null)
      expect(store.outputDirectory).toBeNull()
    })
  })

  describe("toggleFormat", () => {
    it("adds format when not present", () => {
      const store = useSettingsStore()
      // Default is ["txt", "docx"]
      store.toggleFormat("json")
      expect(store.formats).toContain("json")
      expect(store.formats).toHaveLength(3)
    })

    it("removes format when present and more than one format", () => {
      const store = useSettingsStore()
      // Default is ["txt", "docx"]
      store.toggleFormat("txt")
      expect(store.formats).not.toContain("txt")
      expect(store.formats).toEqual(["docx"])
    })

    it("does not remove last format", () => {
      const store = useSettingsStore()
      // Remove all but one
      store.toggleFormat("txt")
      // Now only "docx" remains, try to remove it
      store.toggleFormat("docx")
      // Should still have "docx"
      expect(store.formats).toEqual(["docx"])
    })

    it("can add back a previously removed format", () => {
      const store = useSettingsStore()
      store.toggleFormat("txt") // Remove txt
      store.toggleFormat("txt") // Add txt back
      expect(store.formats).toContain("txt")
    })
  })

  describe("loadSettings", () => {
    it("loads settings from localStorage", () => {
      const savedSettings = {
        dpi: 200,
        formats: ["json"],
        ocrConcurrency: 5,
        pageSeparator: "---",
        outputDirectory: "/custom/path",
      }
      localStorageMock.getItem.mockReturnValueOnce(
        JSON.stringify(savedSettings),
      )

      setActivePinia(createPinia())
      const store = useSettingsStore()

      expect(store.dpi).toBe(200)
      expect(store.formats).toEqual(["json"])
      expect(store.ocrConcurrency).toBe(5)
      expect(store.pageSeparator).toBe("---")
      expect(store.outputDirectory).toBe("/custom/path")
    })

    it("uses defaults for missing fields", () => {
      const partialSettings = {
        dpi: 250,
      }
      localStorageMock.getItem.mockReturnValueOnce(
        JSON.stringify(partialSettings),
      )

      setActivePinia(createPinia())
      const store = useSettingsStore()

      expect(store.dpi).toBe(250)
      expect(store.formats).toEqual(["txt", "docx"]) // default
      expect(store.ocrConcurrency).toBe(12) // default
    })

    it("clamps invalid values from localStorage", () => {
      const invalidSettings = {
        dpi: 1000, // above max
        ocrConcurrency: -5, // below min
      }
      localStorageMock.getItem.mockReturnValueOnce(
        JSON.stringify(invalidSettings),
      )

      setActivePinia(createPinia())
      const store = useSettingsStore()

      expect(store.dpi).toBe(300) // clamped to max
      expect(store.ocrConcurrency).toBe(1) // clamped to min
    })

    it("handles invalid JSON gracefully", () => {
      localStorageMock.getItem.mockReturnValueOnce("invalid json {{{")

      setActivePinia(createPinia())
      const store = useSettingsStore()

      // Should use defaults
      expect(store.dpi).toBe(150)
      expect(store.formats).toEqual(["txt", "docx"])
    })

    it("handles null localStorage value", () => {
      localStorageMock.getItem.mockReturnValueOnce(null)

      setActivePinia(createPinia())
      const store = useSettingsStore()

      // Should use defaults
      expect(store.dpi).toBe(150)
    })
  })

  describe("saveSettings", () => {
    it("saves settings to localStorage", async () => {
      const store = useSettingsStore()
      store.setDpi(200)

      // Wait for the watcher to trigger
      await new Promise((r) => setTimeout(r, 10))

      expect(localStorageMock.setItem).toHaveBeenCalled()
      const savedValue = localStorageMock.setItem.mock.calls.find(
        (call: [string, string]) => call[0] === "tahweel-settings",
      )
      expect(savedValue).toBeDefined()

      const parsed = JSON.parse(savedValue![1])
      expect(parsed.dpi).toBe(200)
    })
  })
})
