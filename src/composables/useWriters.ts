import { writeTextFile } from "@tauri-apps/plugin-fs"
import { Document, Packer, Paragraph, TextRun, PageBreak } from "docx"
import { invoke } from "@tauri-apps/api/core"

export interface WriterOptions {
  pageSeparator?: string
}

export function useWriters() {
  /**
   * Detect if text is predominantly Arabic (for RTL alignment)
   */
  function isArabicText(text: string): boolean {
    const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length
    const otherChars = (text.match(/[^\u0600-\u06FF\s\d\p{P}]/gu) || []).length
    return arabicChars >= otherChars
  }

  /**
   * Compact text by iteratively merging the shortest adjacent line pairs.
   *
   * Algorithm:
   * 1. Split text into individual lines
   * 2. Estimate "effective" line count by accounting for wrapped lines (lines > 80 chars)
   * 3. If effective line count exceeds threshold (40 lines), find the shortest adjacent pair
   * 4. Merge that pair with a space separator
   * 5. Repeat until effective line count is acceptable or only 1 line remains
   *
   * This reduces verbosity while preserving readability by preferentially
   * merging short lines (which are often sentence fragments or bullet points).
   *
   * @param text - The input text to compact
   * @returns The compacted text with merged short lines
   */
  function compactText(text: string): string {
    const MAX_EFFECTIVE_LINES = 40
    const LINE_WRAP_THRESHOLD = 80

    let lines = text.split("\n")

    while (true) {
      // Need at least 2 lines to merge
      if (lines.length < 2) break

      // Estimate effective line count: actual lines + extra lines from wrapping
      // Lines longer than LINE_WRAP_THRESHOLD will visually wrap to ~2 lines
      const wrappedLineCount = lines.filter(
        (l) => l.length > LINE_WRAP_THRESHOLD,
      ).length
      const effectiveLineCount = lines.length + wrappedLineCount

      // Stop if we're within the acceptable range
      if (effectiveLineCount <= MAX_EFFECTIVE_LINES) break

      // Find adjacent pair with minimum combined length (best merge candidates)
      let minIndex = 0
      let minCombinedLength = Infinity
      for (let i = 0; i < lines.length - 1; i++) {
        const combinedLength = lines[i].length + lines[i + 1].length
        if (combinedLength < minCombinedLength) {
          minCombinedLength = combinedLength
          minIndex = i
        }
      }

      // Merge the shortest pair
      lines[minIndex] = `${lines[minIndex]} ${lines[minIndex + 1]}`
      lines.splice(minIndex + 1, 1)
    }

    return lines.join("\n")
  }

  /**
   * Write TXT output
   */
  async function writeTxt(
    texts: string[],
    outputPath: string,
    options: WriterOptions = {},
  ): Promise<void> {
    const separator = options.pageSeparator || "\n\nPAGE_SEPARATOR\n\n"
    const content = texts.map((t) => t.trim()).join(separator)
    await writeTextFile(`${outputPath}.txt`, content)
  }

  /**
   * Write JSON output
   */
  async function writeJson(texts: string[], outputPath: string): Promise<void> {
    const data = texts.map((text, index) => ({
      page: index + 1,
      content: text.trim(),
    }))
    await writeTextFile(`${outputPath}.json`, JSON.stringify(data, null, 2))
  }

  /**
   * Write DOCX output with proper RTL support
   * Each PDF page becomes a separate DOCX page with proper page breaks
   * Matches Ruby gem behavior: paragraph content followed by page break
   */
  async function writeDocx(texts: string[], outputPath: string): Promise<void> {
    const children: Paragraph[] = []

    for (let i = 0; i < texts.length; i++) {
      let text = texts[i]
        .replace(/\r\n?/g, "\n")
        .replace(/(\s)\1+/g, "$1")
        .trim()

      // Compact if too many lines (matching Ruby's behavior)
      text = compactText(text)

      const isRtl = isArabicText(text)
      const lines = text.split("\n")
      const isLastPage = i === texts.length - 1

      // Build children: TextRuns with line breaks, then PageBreak at the end (except last page)
      const paragraphChildren: TextRun | PageBreak[] = []

      lines.forEach((line, lineIndex) => {
        paragraphChildren.push(
          new TextRun({
            text: line,
            size: 20, // 10pt (size is in half-points)
            rightToLeft: isRtl,
          }),
        )

        // Add line break after each line except the last
        if (lineIndex < lines.length - 1) {
          paragraphChildren.push(new TextRun({ break: 1 }))
        }
      })

      // Add page break after content (except for the last page)
      // This matches Ruby's: docx.page if index < texts.size - 1
      if (!isLastPage) {
        paragraphChildren.push(new PageBreak())
      }

      // Create paragraph with proper alignment and bidirectional text
      const paragraph = new Paragraph({
        alignment: isRtl ? "right" : "left",
        bidirectional: isRtl,
        children: paragraphChildren,
      })

      children.push(paragraph)
    }

    const doc = new Document({
      sections: [
        {
          children,
        },
      ],
    })

    // Generate the document as a Blob (works in browser environments)
    const blob = await Packer.toBlob(doc)

    // Convert blob to Uint8Array
    const arrayBuffer = await blob.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)

    // Write using Tauri's file system
    await invoke("write_binary_file", {
      path: `${outputPath}.docx`,
      data: Array.from(uint8Array),
    })
  }

  /**
   * Write outputs in all specified formats
   */
  async function writeOutputs(
    texts: string[],
    outputBasePath: string,
    formats: "txt" | "docx" | "json"[],
    options: WriterOptions = {},
  ): Promise<void> {
    const promises: Promise<void>[] = []

    if (formats.includes("txt")) {
      promises.push(writeTxt(texts, outputBasePath, options))
    }

    if (formats.includes("json")) {
      promises.push(writeJson(texts, outputBasePath))
    }

    if (formats.includes("docx")) {
      promises.push(writeDocx(texts, outputBasePath))
    }

    await Promise.all(promises)
  }

  return {
    isArabicText,
    compactText,
    writeTxt,
    writeJson,
    writeDocx,
    writeOutputs,
  }
}
