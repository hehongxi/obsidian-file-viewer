import ConvertibleFileView from "src/core/convertible-file-view"
import FileViewerPlugin from "src/main"
import { TFile } from "obsidian"

/**
 * DOC File View (Word 97-2003 binary format)
 *
 * Preview: Renders extracted text with basic formatting.
 * Convert: Extracts text content to Markdown.
 *
 * Uses word-extractor (MIT, 74KB) which parses OLE compound documents in pure JS.
 * Only the Buffer-based .doc path is used (no fs, no yauzl).
 */

export default class DocFileView extends ConvertibleFileView {
  static readonly VIEW_TYPE_ID = "fv-doc-view"

  getViewType(): string {
    return DocFileView.VIEW_TYPE_ID
  }

  private static async extractDoc(buffer: ArrayBuffer): Promise<{ body: string; headers: string; footnotes: string; annotations: string }> {
    const WordExtractor = (await import("word-extractor")).default
    const extractor = new WordExtractor()
    const doc = await extractor.extract(Buffer.from(buffer))
    return {
      body: doc.getBody() || "",
      headers: doc.getHeaders() || "",
      footnotes: doc.getFootnotes() || "",
      annotations: doc.getAnnotations() || "",
    }
  }

  static async getFilePreview(plugin: FileViewerPlugin, file: TFile | null): Promise<HTMLElement | null> {
    if (!file) return null

    const wrapper = document.createElement("div")
    wrapper.addClass("fv-doc-wrapper")

    try {
      const buffer = await plugin.app.vault.readBinary(file)
      const content = await DocFileView.extractDoc(buffer)

      // Header
      const header = wrapper.createEl("div", { cls: "fv-doc-header" })
      header.createEl("span", { cls: "fv-doc-filename", text: file.basename })
      const size = buffer.byteLength
      const sizeStr = size < 1024 ? `${size} B` : size < 1048576 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1048576).toFixed(1)} MB`
      header.createEl("span", { cls: "fv-doc-info", text: `DOC · ${sizeStr}` })

      // Body content
      if (content.body) {
        const bodyEl = wrapper.createEl("div", { cls: "fv-doc-body" })
        const paragraphs = content.body.split(/\r?\n\r?\n/)
        for (const para of paragraphs) {
          const trimmed = para.trim()
          if (!trimmed) continue
          // Detect headings (lines that are all caps or very short)
          const lines = trimmed.split(/\r?\n/)
          const text = lines.join(" ").trim()
          if (text) {
            bodyEl.createEl("p", { text })
          }
        }
      }

      // Footnotes
      if (content.footnotes) {
        const fnSection = wrapper.createEl("details", { cls: "fv-doc-section" })
        fnSection.createEl("summary", { text: `Footnotes (${content.footnotes.split(/\r?\n/).length} items)` })
        fnSection.createEl("pre", { text: content.footnotes, cls: "fv-doc-pre" })
      }

      // Annotations (comments)
      if (content.annotations) {
        const annSection = wrapper.createEl("details", { cls: "fv-doc-section" })
        annSection.createEl("summary", { text: `Comments` })
        annSection.createEl("pre", { text: content.annotations, cls: "fv-doc-pre" })
      }

      if (!content.body && !content.footnotes && !content.annotations) {
        wrapper.createEl("div", { cls: "fv-doc-empty", text: "(Empty document)" })
      }
    } catch (e) {
      console.error("Failed to read DOC file", file.path, e)
      wrapper.createEl("div", { cls: "fv-doc-error", text: `(Error reading: ${file.name})` })
    }

    return wrapper
  }

  async getFilePreview(): Promise<HTMLElement | null> {
    return DocFileView.getFilePreview(this.plugin, this.file)
  }

  async getMarkdownContent(attachmentsDirectory: string): Promise<string | null> {
    if (!this.file) return null

    try {
      const buffer = await this.app.vault.readBinary(this.file)
      const content = await DocFileView.extractDoc(buffer)

      const parts: string[] = []

      // Title
      parts.push(`# ${this.file.basename}`)
      parts.push("")

      // Body
      if (content.body) {
        const paragraphs = content.body.split(/\r?\n\r?\n/)
        for (const para of paragraphs) {
          const trimmed = para.trim()
          if (trimmed) {
            parts.push(trimmed.split(/\r?\n/).join(" "))
            parts.push("")
          }
        }
      }

      // Footnotes
      if (content.footnotes) {
        parts.push("## Footnotes")
        parts.push("")
        parts.push(content.footnotes)
        parts.push("")
      }

      // Comments
      if (content.annotations) {
        parts.push("## Comments")
        parts.push("")
        parts.push(content.annotations)
        parts.push("")
      }

      return parts.join("\n").trim() || "(empty document)"
    } catch (e) {
      console.error("Failed to convert DOC to Markdown", this.file.path, e)
      return `(Error reading DOC: ${this.file.name})`
    }
  }
}
