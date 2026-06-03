import ConvertibleFileView from "src/core/convertible-file-view"
import FileViewerPlugin from "src/main"
import { TFile } from "obsidian"

/**
 * PPTX File View
 *
 * Preview: Canvas rendering of slides via pptx-browser, with Prev/Next navigation.
 * Convert: Structured text extraction → Markdown (titles, body text, tables, notes).
 *
 * Uses pptx-browser (zero deps, MIT) for both preview and text extraction.
 * Canvas rendering preserves fonts, colors, and layout fidelity.
 */

/** Load pptx-browser (bundled into main.js). */
async function loadPptx() {
  return import("pptx-browser")
}

interface TableCell { text: string; row: number; col: number; rowSpan: number; colSpan: number }

export default class PptxFileView extends ConvertibleFileView {
  static readonly VIEW_TYPE_ID = "fv-pptx-view"

  getViewType(): string {
    return PptxFileView.VIEW_TYPE_ID
  }

  static async getFilePreview(plugin: FileViewerPlugin, file: TFile | null): Promise<HTMLElement | null> {
    if (!file) return null

    const wrapper = document.createElement("div")
    wrapper.addClass("fv-pptx-wrapper")

    try {
      const buffer = await plugin.app.vault.readBinary(file)
      const pptx = await loadPptx()
      const renderer = new pptx.PptxRenderer()
      await renderer.load(new Uint8Array(buffer))

      const info = renderer.getInfo()
      const totalSlides = info.slideCount

      if (totalSlides === 0) {
        wrapper.createEl("div", { cls: "fv-pptx-empty", text: "(Empty presentation)" })
        renderer.destroy()
        return wrapper
      }

      // Header with file info
      const header = wrapper.createEl("div", { cls: "fv-pptx-header" })
      header.createEl("span", { cls: "fv-pptx-filename", text: file.basename })
      header.createEl("span", { cls: "fv-pptx-info", text: `${totalSlides} slide${totalSlides > 1 ? "s" : ""} · ${info.width.toFixed(1)}×${info.height.toFixed(1)} in` })

      // Canvas container
      const canvasContainer = wrapper.createEl("div", { cls: "fv-pptx-canvas-container" })
      const canvas = canvasContainer.createEl("canvas")
      canvas.addClass("fv-pptx-canvas")

      // Navigation
      const nav = wrapper.createEl("div", { cls: "fv-pptx-nav" })
      const prevBtn = nav.createEl("button", { cls: "fv-pptx-btn", text: "Prev" })
      const slideIndicator = nav.createEl("span", { cls: "fv-pptx-indicator", text: `1 / ${totalSlides}` })
      const nextBtn = nav.createEl("button", { cls: "fv-pptx-btn", text: "Next" })

      let currentIndex = 0

      const renderSlide = async (index: number) => {
        try {
          await renderer.renderSlide(index, canvas, canvasContainer.clientWidth || 800)
          currentIndex = index
          slideIndicator.textContent = `${index + 1} / ${totalSlides}`
          prevBtn.disabled = index === 0
          nextBtn.disabled = index === totalSlides - 1
        } catch (e) {
          console.error("Failed to render PPTX slide", index, e)
        }
      }

      prevBtn.onclick = () => { if (currentIndex > 0) void renderSlide(currentIndex - 1) }
      nextBtn.onclick = () => { if (currentIndex < totalSlides - 1) void renderSlide(currentIndex + 1) }

      // Keyboard navigation
      wrapper.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") { prevBtn.click(); e.preventDefault() }
        if (e.key === "ArrowRight" || e.key === "ArrowDown") { nextBtn.click(); e.preventDefault() }
      })
      wrapper.tabIndex = 0

      // Initial render
      await renderSlide(0)

      // Store renderer for cleanup
      wrapper.addEventListener("DOMNodeRemovedFromDocument", () => renderer.destroy())
    } catch (e) {
      console.error("Failed to create PPTX preview", file.path, e)
      const errorMsg = wrapper.createEl("div", { cls: "fv-pptx-error" })
      errorMsg.textContent = `(Error loading: ${file.name})`
    }

    return wrapper
  }

  async getFilePreview(): Promise<HTMLElement | null> {
    return PptxFileView.getFilePreview(this.plugin, this.file)
  }

  async getMarkdownContent(attachmentsDirectory: string): Promise<string | null> {
    if (!this.file) return null

    try {
      const buffer = await this.app.vault.readBinary(this.file)
      const pptx = await loadPptx()
      const renderer = new pptx.PptxRenderer()
      await renderer.load(new Uint8Array(buffer))

      const slides = await renderer.extractAll()
      const parts: string[] = []

      // Title
      parts.push(`# ${this.file.basename}`)
      parts.push("")

      for (const slide of slides) {
        // Slide heading
        const slideTitle = slide.title || slide.subtitle || `Slide ${slide.index + 1}`
        parts.push(`## ${slideTitle}`)
        parts.push("")

        // Text shapes (non-title)
        for (const shape of slide.textShapes) {
          if (shape.type === "title" || shape.type === "subtitle") continue

          for (const para of shape.paragraphs) {
            const indent = "  ".repeat(Math.min(para.level, 4))
            const prefix = para.bullet && para.bullet !== "{auto}" ? `${para.bullet} ` : para.bullet === "{auto}" ? "1. " : ""

            // Inline formatting
            let lineText = ""
            for (const run of para.runs) {
              let t = run.text
              if (run.bold) t = `**${t}**`
              if (run.italic) t = `*${t}*`
              lineText += t
            }

            parts.push(`${indent}${prefix}${lineText}`)
          }
          parts.push("")
        }

        // Tables
        for (const table of slide.tables) {
          if (table.rows.length === 0) continue

          // Header row
          const headerRow = table.rows[0] as TableCell[]
          parts.push("| " + headerRow.map((c: TableCell) => c.text.replace(/\n/g, " ")).join(" | ") + " |")
          parts.push("| " + headerRow.map(() => "---").join(" | ") + " |")

          // Data rows
          for (let r = 1; r < table.rows.length; r++) {
            const row = table.rows[r] as TableCell[]
            parts.push("| " + row.map((c: TableCell) => c.text.replace(/\n/g, " ")).join(" | ") + " |")
          }
          parts.push("")
        }

        // Images (alt text only — can't embed binary from PPTX)
        for (const img of slide.images) {
          if (img.altText) {
            parts.push(`*Image: ${img.altText}*`)
            parts.push("")
          }
        }

        // Charts
        for (const chart of slide.charts) {
          parts.push(`*${chart.chartType} chart: ${chart.seriesNames.join(", ")}*`)
          if (chart.categories.length > 0) {
            parts.push(`Categories: ${chart.categories.join(", ")}`)
          }
          parts.push("")
        }

        // Speaker notes
        if (slide.notes) {
          parts.push("> **Speaker notes:** " + slide.notes.split("\n").join("\n> "))
          parts.push("")
        }

        parts.push("---")
        parts.push("")
      }

      renderer.destroy()
      return parts.join("\n").trim()
    } catch (e) {
      console.error("Failed to convert PPTX to Markdown", this.file.path, e)
      return `(Error reading PPTX: ${this.file.name})`
    }
  }
}