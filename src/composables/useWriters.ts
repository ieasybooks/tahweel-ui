import { writeTextFile } from "@tauri-apps/plugin-fs";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { invoke } from "@tauri-apps/api/core";

export interface WriterOptions {
  pageSeparator?: string;
}

export function useWriters() {
  /**
   * Detect if text is predominantly Arabic (for RTL alignment)
   */
  function isArabicText(text: string): boolean {
    const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
    const otherChars = (text.match(/[^\u0600-\u06FF\s\d\p{P}]/gu) || []).length;
    return arabicChars >= otherChars;
  }

  /**
   * Compact text by merging short adjacent lines
   */
  function compactText(text: string): string {
    const lines = text.split("\n");
    if (lines.length < 2) return text;

    // Count expected lines (including wrapped lines)
    const expectedLines = lines.length + lines.filter((l) => l.length > 80).length;
    if (expectedLines <= 40) return text;

    // Find the pair with minimum combined length and merge
    let minIndex = 0;
    let minLength = Infinity;
    for (let i = 0; i < lines.length - 1; i++) {
      const combined = lines[i].length + lines[i + 1].length;
      if (combined < minLength) {
        minLength = combined;
        minIndex = i;
      }
    }

    lines[minIndex] = `${lines[minIndex]} ${lines[minIndex + 1]}`;
    lines.splice(minIndex + 1, 1);

    return compactText(lines.join("\n"));
  }

  /**
   * Write TXT output
   */
  async function writeTxt(
    texts: string[],
    outputPath: string,
    options: WriterOptions = {}
  ): Promise<void> {
    const separator = options.pageSeparator || "\n\nPAGE_SEPARATOR\n\n";
    const content = texts.map((t) => t.trim()).join(separator);
    await writeTextFile(`${outputPath}.txt`, content);
  }

  /**
   * Write JSON output
   */
  async function writeJson(texts: string[], outputPath: string): Promise<void> {
    const data = texts.map((text, index) => ({
      page: index + 1,
      content: text.trim(),
    }));
    await writeTextFile(`${outputPath}.json`, JSON.stringify(data, null, 2));
  }

  /**
   * Write DOCX output with proper RTL support
   */
  async function writeDocx(texts: string[], outputPath: string): Promise<void> {
    const children: Paragraph[] = [];

    for (let i = 0; i < texts.length; i++) {
      let text = texts[i]
        .replace(/\r\n?/g, "\n")
        .replace(/(\s)\1+/g, "$1")
        .trim();

      // Compact if too many lines
      text = compactText(text);

      const isRtl = isArabicText(text);
      const lines = text.split("\n");

      // Create paragraph with proper alignment and bidirectional text
      const paragraph = new Paragraph({
        alignment: isRtl ? "right" : "left",
        bidirectional: isRtl,
        children: lines.flatMap((line, lineIndex) => {
          const elements: TextRun[] = [
            new TextRun({
              text: line,
              size: 20, // 10pt (size is in half-points)
              rightToLeft: isRtl,
            }),
          ];

          // Add line break except for the last line
          if (lineIndex < lines.length - 1) {
            elements.push(new TextRun({ break: 1 }));
          }

          return elements;
        }),
      });

      children.push(paragraph);

      // Add page break between pages (except after the last one)
      if (i < texts.length - 1) {
        children.push(
          new Paragraph({
            children: [],
            pageBreakBefore: true,
          })
        );
      }
    }

    const doc = new Document({
      sections: [
        {
          children,
        },
      ],
    });

    // Generate the document buffer
    const buffer = await Packer.toBuffer(doc);

    // Write using Tauri's file system
    await invoke("write_binary_file", {
      path: `${outputPath}.docx`,
      data: Array.from(new Uint8Array(buffer)),
    });
  }

  /**
   * Write outputs in all specified formats
   */
  async function writeOutputs(
    texts: string[],
    outputBasePath: string,
    formats: ("txt" | "docx" | "json")[],
    options: WriterOptions = {}
  ): Promise<void> {
    const promises: Promise<void>[] = [];

    if (formats.includes("txt")) {
      promises.push(writeTxt(texts, outputBasePath, options));
    }

    if (formats.includes("json")) {
      promises.push(writeJson(texts, outputBasePath));
    }

    if (formats.includes("docx")) {
      promises.push(writeDocx(texts, outputBasePath));
    }

    await Promise.all(promises);
  }

  return {
    isArabicText,
    compactText,
    writeTxt,
    writeJson,
    writeDocx,
    writeOutputs,
  };
}
