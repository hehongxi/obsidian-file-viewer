import ConvertibleFileView from "src/core/convertible-file-view"
import FileViewerPlugin from "src/main"
import { TFile } from "obsidian"

/** Load pdfjs-dist at runtime from copied dist/pdf.worker.js.
 * Uses Function constructor to create a dynamic import that esbuild
 * cannot statically analyze, keeping the file as a standalone chunk. */
async function loadPdfJs(): Promise<unknown> {
   
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const dynamicImport = new Function("specifier", "return import(specifier)") as (s: string) => Promise<unknown>
  return dynamicImport("./pdf.worker.js")
}
interface PageCache {
  canvas: HTMLCanvasElement
  scale: number
}

export default class PdfFileView extends ConvertibleFileView {
  static readonly VIEW_TYPE_ID = "pdf-view"

  private pdfDoc: unknown = null
  private currentPage: number = 1
  private pageCount: number = 0
  /** Canvas cache. Evicted outside ±2 window. */
  private pageCache: Map<number, PageCache> = new Map()
  private pdfContainer: HTMLElement | null = null

  getViewType(): string {
    return PdfFileView.VIEW_TYPE_ID
  }

  // ── Static (embed) preview ──────────────────────────────────────────────

  static async getFilePreview(plugin: FileViewerPlugin, file: TFile | null): Promise<HTMLElement | null> {
    if (!file) return null

    const container = document.createElement("div")
    container.addClass("fv-pdf-container")

    let fileBuffer: ArrayBuffer
    try {
      fileBuffer = await plugin.app.vault.readBinary(file)
    } catch (e) {
      console.error("Failed to read PDF file", file.path, e)
      container.createEl("p", {
        text: `(Error reading file: ${file.basename})`,
        cls: "fv-error-message",
      })
      return container
    }

    try {
      const pdfjsLib = await loadPdfJs()
      const loadingTask = pdfjsLib.getDocument({ data: fileBuffer })
      const doc = await loadingTask.promise
      const page = await doc.getPage(1)
      const viewport = page.getViewport({ scale: 1.5 })

      const canvas = document.createElement("canvas")
      canvas.addClass("fv-pdf-canvas")
      canvas.width = viewport.width
      canvas.height = viewport.height

      const ctx = canvas.getContext("2d")
      if (ctx) {
        await page.render({ canvasContext: ctx, viewport }).promise
      }

      container.appendChild(canvas)
    } catch (e) {
      console.error("Failed to load PDF", file.path, e)
      container.createEl("p", {
        text: `(Failed to load PDF: ${file.basename})`,
        cls: "fv-error-message",
      })
    }

    return container
  }

  // ── Instance preview ────────────────────────────────────────────────────

  async getFilePreview(): Promise<HTMLElement | null> {
    if (!this.file) return null

    const container = document.createElement("div")
    container.addClass("fv-pdf-container")
    this.pdfContainer = container

    // Read file
    let fileBuffer: ArrayBuffer
    try {
      fileBuffer = await this.app.vault.readBinary(this.file)
    } catch (e) {
      console.error("Failed to read PDF file", this.file.path, e)
      container.createEl("p", {
        text: `(Error reading file: ${this.file.basename})`,
        cls: "fv-error-message",
      })
      return container
    }

    // Load PDF
    try {
      const pdfjsLib = await loadPdfJs()
      const loadingTask = pdfjsLib.getDocument({ data: fileBuffer })
      this.pdfDoc = await loadingTask.promise
      this.pageCount = this.pdfDoc.numPages
    } catch (e) {
      console.error("Failed to load PDF", this.file.path, e)
      container.createEl("p", {
        text: `(Failed to load PDF: ${this.file.basename})`,
        cls: "fv-error-message",
      })
      return container
    }

    // Navigation bar
    const nav = document.createElement("div")
    nav.addClass("fv-pdf-nav")

    const prevBtn = document.createElement("button")
    prevBtn.textContent = "◀ Prev"
    prevBtn.addClass("fv-pdf-nav-btn")
    prevBtn.onclick = () => this.navigateTo(this.currentPage - 1)

    const pageInfo = document.createElement("span")
    pageInfo.addClass("fv-pdf-page-info")

    const nextBtn = document.createElement("button")
    nextBtn.textContent = "Next ▶"
    nextBtn.addClass("fv-pdf-nav-btn")
    nextBtn.onclick = () => this.navigateTo(this.currentPage + 1)

    nav.appendChild(prevBtn)
    nav.appendChild(pageInfo)
    nav.appendChild(nextBtn)
    container.appendChild(nav)

    // Canvas container
    const canvasContainer = document.createElement("div")
    canvasContainer.addClass("fv-pdf-canvas-container")
    container.appendChild(canvasContainer)

    // Store refs for navigation
    ;(container as unknown).__pdfCanvasContainer = canvasContainer
    ;(container as unknown).__pdfPageInfo = pageInfo
    ;(container as unknown).__pdfPrevBtn = prevBtn
    ;(container as unknown).__pdfNextBtn = nextBtn

    // Render initial pages
    await this.renderPages(canvasContainer)
    this.updateNav()

    return container
  }

  // ── Navigation ──────────────────────────────────────────────────────────

  private async navigateTo(page: number): Promise<void> {
    if (page < 1 || page > this.pageCount) return
    this.currentPage = page

    const container = this.pdfContainer
    if (!container) return

    const canvasContainer = (container as unknown).__pdfCanvasContainer as HTMLElement
    if (!canvasContainer) return

    await this.renderPages(canvasContainer)
    this.updateNav()
  }

  // ── Page rendering with ±2 window eviction ──────────────────────────────

  private async renderPages(canvasContainer: HTMLElement): Promise<void> {
    if (!this.pdfDoc) return

    const rangeStart = Math.max(1, this.currentPage - 2)
    const rangeEnd = Math.min(this.pageCount, this.currentPage + 2)

    // Evict pages outside ±2 window
    for (const [pageNum, cached] of this.pageCache) {
      if (pageNum < rangeStart || pageNum > rangeEnd) {
        cached.canvas.remove()
        this.pageCache.delete(pageNum)
      }
    }

    // Render pages inside window
    for (let p = rangeStart; p <= rangeEnd; p++) {
      if (this.pageCache.has(p)) continue

      const canvas = document.createElement("canvas")
      canvas.addClass("fv-pdf-canvas")
      if (p === this.currentPage) {
        canvas.addClass("fv-pdf-canvas-current")
      } else {
        canvas.addClass("fv-pdf-canvas-adjacent")
      }

      canvasContainer.appendChild(canvas)
      this.pageCache.set(p, { canvas, scale: 1.5 })

      await this.renderOnePage(p, canvas)
    }
  }

  private async renderOnePage(pageNum: number, canvas: HTMLCanvasElement): Promise<void> {
    if (!this.pdfDoc) return
    try {
      const page = await this.pdfDoc.getPage(pageNum)
      const viewport = page.getViewport({ scale: 1.5 })
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext("2d")
      if (ctx) {
        await page.render({ canvasContext: ctx, viewport }).promise
      }
    } catch (e) {
      console.error(`Failed to render PDF page ${pageNum}`, e)
    }
  }

  private updateNav(): void {
    const container = this.pdfContainer
    if (!container) return

    const pageInfo = (container as unknown).__pdfPageInfo as HTMLElement
    const prevBtn = (container as unknown).__pdfPrevBtn as HTMLButtonElement
    const nextBtn = (container as unknown).__pdfNextBtn as HTMLButtonElement

    if (pageInfo) pageInfo.textContent = `${this.currentPage} / ${this.pageCount}`
    if (prevBtn) prevBtn.disabled = this.currentPage <= 1
    if (nextBtn) nextBtn.disabled = this.currentPage >= this.pageCount
  }

  // ── Markdown conversion (text layer extraction) ─────────────────────────

  async getMarkdownContent(_attachmentsDirectory: string): Promise<string | null> {
    if (!this.file) return null

    let fileBuffer: ArrayBuffer
    try {
      fileBuffer = await this.app.vault.readBinary(this.file)
    } catch (e) {
      console.error("Failed to read PDF file", this.file.path, e)
      return `(Error reading file: ${this.file.basename})`
    }

    try {
      const pdfjsLib = await loadPdfJs()
      const loadingTask = pdfjsLib.getDocument({ data: fileBuffer })
      const doc = await loadingTask.promise

      const parts: string[] = []
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i)
        const textContent = await page.getTextContent()

        parts.push(`## Page ${i}\n`)

        if (textContent.items.length === 0) {
          parts.push("\n*(No text content on this page)*\n\n")
          continue
        }

        // Group text items by approximate y-position (lines)
        const Y_TOLERANCE = 2
        const lines: Map<number, Array<{ text: string; x: number }>> = new Map()

        for (const item of textContent.items) {
          // Type guard: TextMarkedContent doesn't have transform/str
          if (!("str" in item) || !("transform" in item)) continue
          const y = (item).transform[5]
          let found = false
          for (const [lineY, lineItems] of lines) {
            if (Math.abs(y - lineY) < Y_TOLERANCE) {
              lineItems.push({ text: (item).str, x: (item).transform[4] })
              found = true
              break
            }
          }
          if (!found) {
            lines.set(y, [{ text: (item).str, x: (item).transform[4] }])
          }
        }

        // Sort lines by y (PDF coordinates: descending y = top to bottom)
        const sortedLines = [...lines.entries()].sort((a, b) => b[0] - a[0])

        for (const [, items] of sortedLines) {
          items.sort((a, b) => a.x - b.x)
          const lineText = items.map((it) => it.text).join(" ").trim()
          if (lineText) parts.push(lineText + "\n")
        }

        parts.push("\n")
      }

      return parts.join("")
    } catch (e) {
      console.error("Failed to convert PDF to markdown", this.file.path, e)
      return `(Failed to convert PDF: ${this.file.basename})`
    }
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────

  async onUnloadFile(file: TFile): Promise<void> {
    // Destroy cached canvases
    for (const [, cached] of this.pageCache) {
      cached.canvas.remove()
    }
    this.pageCache.clear()

    // Release PDF document
    if (this.pdfDoc) {
      try { (this.pdfDoc).destroy() } catch { /* ignore */ }
      this.pdfDoc = null
    }

    this.currentPage = 1
    this.pageCount = 0
    this.pdfContainer = null

    await super.onUnloadFile(file)
  }
}