import { describe, it, expect } from "vitest";
import { messages, type MessageSchema } from "../index";

describe("i18n messages", () => {
  describe("message structure", () => {
    it("has both ar and en locales", () => {
      expect(messages).toHaveProperty("ar");
      expect(messages).toHaveProperty("en");
    });

    it("ar and en have the same top-level keys", () => {
      const arKeys = Object.keys(messages.ar).sort();
      const enKeys = Object.keys(messages.en).sort();
      expect(arKeys).toEqual(enKeys);
    });

    it("all sections have matching keys between locales", () => {
      const sections = Object.keys(messages.en) as (keyof MessageSchema)[];

      for (const section of sections) {
        const arSection = messages.ar[section];
        const enSection = messages.en[section];

        if (typeof arSection === "object" && typeof enSection === "object") {
          const arKeys = Object.keys(arSection).sort();
          const enKeys = Object.keys(enSection).sort();
          expect(arKeys).toEqual(enKeys);
        }
      }
    });
  });

  describe("app section", () => {
    it("has required app keys", () => {
      expect(messages.en.app).toHaveProperty("title");
      expect(messages.en.app).toHaveProperty("subtitle");
      expect(messages.en.app).toHaveProperty("note");
      expect(messages.en.app).toHaveProperty("windowTitle");
    });

    it("English title is Tahweel", () => {
      expect(messages.en.app.title).toBe("Tahweel");
    });

    it("Arabic title is in Arabic script", () => {
      expect(messages.ar.app.title).toMatch(/[\u0600-\u06FF]/);
    });
  });

  describe("buttons section", () => {
    it("has all button labels", () => {
      const expectedButtons = [
        "convertFile",
        "convertFolder",
        "language",
        "signIn",
        "signOut",
        "openFolder",
        "cancel",
        "newConversion",
      ];

      for (const button of expectedButtons) {
        expect(messages.en.buttons).toHaveProperty(button);
        expect(messages.ar.buttons).toHaveProperty(button);
      }
    });

    it("language button shows opposite language", () => {
      expect(messages.en.buttons.language).toBe("العربية");
      expect(messages.ar.buttons.language).toBe("English");
    });
  });

  describe("progress section", () => {
    it("has all progress stages", () => {
      const expectedStages = [
        "global",
        "file",
        "preparing",
        "splitting",
        "ocr",
        "writing",
        "done",
        "cancelling",
      ];

      for (const stage of expectedStages) {
        expect(messages.en.progress).toHaveProperty(stage);
        expect(messages.ar.progress).toHaveProperty(stage);
      }
    });
  });

  describe("messages section", () => {
    it("has error and success messages", () => {
      const expectedMessages = [
        "successTitle",
        "errorTitle",
        "noFiles",
        "badExtension",
        "authRequired",
        "conversionComplete",
        "conversionCompleteOne",
        "conversionCompleteTwo",
      ];

      for (const msg of expectedMessages) {
        expect(messages.en.messages).toHaveProperty(msg);
        expect(messages.ar.messages).toHaveProperty(msg);
      }
    });

    it("conversionComplete uses placeholder for count", () => {
      expect(messages.en.messages.conversionComplete).toContain("{count}");
      expect(messages.ar.messages.conversionComplete).toContain("{count}");
    });
  });

  describe("settings section", () => {
    it("has all settings labels", () => {
      const expectedSettings = [
        "title",
        "dpi",
        "formats",
        "concurrency",
        "ocrConcurrency",
        "outputDirectory",
        "outputDirectoryHint",
        "clearOutputDirectory",
        "useInputDirectory",
      ];

      for (const setting of expectedSettings) {
        expect(messages.en.settings).toHaveProperty(setting);
        expect(messages.ar.settings).toHaveProperty(setting);
      }
    });
  });

  describe("auth section", () => {
    it("has sign in status messages", () => {
      expect(messages.en.auth).toHaveProperty("signedIn");
      expect(messages.en.auth).toHaveProperty("notSignedIn");
      expect(messages.ar.auth).toHaveProperty("signedIn");
      expect(messages.ar.auth).toHaveProperty("notSignedIn");
    });
  });

  describe("dropzone section", () => {
    it("has dropzone labels", () => {
      expect(messages.en.dropzone).toHaveProperty("dropHere");
      expect(messages.en.dropzone).toHaveProperty("supportedFormats");
      expect(messages.ar.dropzone).toHaveProperty("dropHere");
      expect(messages.ar.dropzone).toHaveProperty("supportedFormats");
    });

    it("supportedFormats lists PDF and image formats", () => {
      expect(messages.en.dropzone.supportedFormats).toMatch(/PDF/i);
      expect(messages.en.dropzone.supportedFormats).toMatch(/JPG|JPEG/i);
      expect(messages.en.dropzone.supportedFormats).toMatch(/PNG/i);
    });
  });

  describe("no empty values", () => {
    it("all English values are non-empty strings", () => {
      function checkNonEmpty(obj: Record<string, unknown>, path = "") {
        for (const [key, value] of Object.entries(obj)) {
          const currentPath = path ? `${path}.${key}` : key;
          if (typeof value === "object" && value !== null) {
            checkNonEmpty(value as Record<string, unknown>, currentPath);
          } else if (typeof value === "string") {
            expect(value.trim().length, `${currentPath} should not be empty`).toBeGreaterThan(0);
          }
        }
      }
      checkNonEmpty(messages.en);
    });

    it("all Arabic values are non-empty strings", () => {
      function checkNonEmpty(obj: Record<string, unknown>, path = "") {
        for (const [key, value] of Object.entries(obj)) {
          const currentPath = path ? `${path}.${key}` : key;
          if (typeof value === "object" && value !== null) {
            checkNonEmpty(value as Record<string, unknown>, currentPath);
          } else if (typeof value === "string") {
            expect(value.trim().length, `${currentPath} should not be empty`).toBeGreaterThan(0);
          }
        }
      }
      checkNonEmpty(messages.ar);
    });
  });
});
