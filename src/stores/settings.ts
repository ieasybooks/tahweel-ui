import { defineStore } from "pinia";
import { ref, watch } from "vue";

export interface Settings {
  dpi: number;
  formats: ("txt" | "docx" | "json")[];
  ocrConcurrency: number;
  pageSeparator: string;
}

const STORAGE_KEY = "tahweel-settings";

export const useSettingsStore = defineStore("settings", () => {
  const dpi = ref(150);
  const formats = ref<("txt" | "docx" | "json")[]>(["txt", "docx"]);
  const ocrConcurrency = ref(12);
  const pageSeparator = ref("\n\nPAGE_SEPARATOR\n\n");

  // Load settings from localStorage
  function loadSettings() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Settings;
        dpi.value = parsed.dpi ?? 150;
        formats.value = parsed.formats ?? ["txt", "docx"];
        ocrConcurrency.value = parsed.ocrConcurrency ?? 12;
        pageSeparator.value = parsed.pageSeparator ?? "\n\nPAGE_SEPARATOR\n\n";
      }
    } catch {
      // Ignore errors, use defaults
    }
  }

  // Save settings to localStorage
  function saveSettings() {
    const settings: Settings = {
      dpi: dpi.value,
      formats: formats.value,
      ocrConcurrency: ocrConcurrency.value,
      pageSeparator: pageSeparator.value,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }

  // Auto-save when settings change
  watch([dpi, formats, ocrConcurrency, pageSeparator], saveSettings, { deep: true });

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
    toggleFormat,
    loadSettings,
    saveSettings,
  };
});
