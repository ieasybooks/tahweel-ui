import { defineStore } from "pinia";
import { ref, watch } from "vue";

export interface Settings {
  dpi: number;
  formats: ("txt" | "docx" | "json")[];
  ocrConcurrency: number;
  pageSeparator: string;
  outputDirectory: string | null;
}

const STORAGE_KEY = "tahweel-settings";

// Validation constants
const DPI_MIN = 72;
const DPI_MAX = 300;
const CONCURRENCY_MIN = 1;
const CONCURRENCY_MAX = 20;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export const useSettingsStore = defineStore("settings", () => {
  const dpi = ref(150);
  const formats = ref<("txt" | "docx" | "json")[]>(["txt", "docx"]);
  const ocrConcurrency = ref(12);
  const pageSeparator = ref("\n\nPAGE_SEPARATOR\n\n");
  const outputDirectory = ref<string | null>(null);

  // Load settings from localStorage with validation
  function loadSettings() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Settings;
        // Validate and clamp values to prevent tampered localStorage values
        dpi.value = clamp(parsed.dpi ?? 150, DPI_MIN, DPI_MAX);
        formats.value = parsed.formats ?? ["txt", "docx"];
        ocrConcurrency.value = clamp(parsed.ocrConcurrency ?? 12, CONCURRENCY_MIN, CONCURRENCY_MAX);
        pageSeparator.value = parsed.pageSeparator ?? "\n\nPAGE_SEPARATOR\n\n";
        outputDirectory.value = parsed.outputDirectory ?? null;
      }
    } catch {
      // Ignore errors, use defaults
    }
  }

  // Validated setters
  function setDpi(value: number) {
    dpi.value = clamp(value, DPI_MIN, DPI_MAX);
  }

  function setOcrConcurrency(value: number) {
    ocrConcurrency.value = clamp(value, CONCURRENCY_MIN, CONCURRENCY_MAX);
  }

  function setOutputDirectory(path: string | null) {
    outputDirectory.value = path;
  }

  // Save settings to localStorage
  function saveSettings() {
    const settings: Settings = {
      dpi: dpi.value,
      formats: formats.value,
      ocrConcurrency: ocrConcurrency.value,
      pageSeparator: pageSeparator.value,
      outputDirectory: outputDirectory.value,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }

  // Auto-save when settings change
  watch([dpi, formats, ocrConcurrency, pageSeparator, outputDirectory], saveSettings, { deep: true });

  // Load on init
  loadSettings();

  function toggleFormat(format: "txt" | "docx" | "json") {
    const index = formats.value.indexOf(format);
    if (index === -1) {
      formats.value.push(format);
    } else if (formats.value.length > 1) {
      formats.value.splice(index, 1);
    }
  }

  return {
    dpi,
    formats,
    ocrConcurrency,
    pageSeparator,
    outputDirectory,
    toggleFormat,
    loadSettings,
    saveSettings,
    setDpi,
    setOcrConcurrency,
    setOutputDirectory,
  };
});
