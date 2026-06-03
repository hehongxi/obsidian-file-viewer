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
}