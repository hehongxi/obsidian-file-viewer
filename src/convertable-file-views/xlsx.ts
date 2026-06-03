import ConvertibleFileView from "src/core/convertible-file-view"
import FileViewerPlugin from "src/main"
import { TFile } from "obsidian"

/**
 * XLSX / Excel File View
 *
 * Preview: x-data-spreadsheet Canvas renderer (Excel-like appearance).
 * Uses SheetJS for parsing + stox() conversion to x-data-spreadsheet format.
 *
 * Supports: .xlsx (Office Open XML), .xls (legacy binary)
 */

/** Max rows to render in preview (safety limit) */
const PREVIEW_MAX_ROWS = 5000

/** File size threshold for metadata-only mode (50MB) */
const SIZE_GATE_BYTES = 50 * 1024 * 1024

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B"
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB"
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB"
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB"
}

/**
 * Convert SheetJS workbook → x-data-spreadsheet data format.
 * From SheetJS official demo: https://docs.sheetjs.com/docs/demos/grid/xs
 */
function stox(workbook: { SheetNames: string[]; Sheets: Record<string, unknown> }): unknown[] {
  const out: unknown[] = []
  const XLSX = require("xlsx")
  workbook.SheetNames.forEach((name: string) => {
    const o: { name: string; rows: Record<number, { cells: Record<number, { text: string }> }> } = { name, rows: {} }
    const ws = workbook.Sheets[name]
    const aoa: string[][] = XLSX.utils.sheet_to_json(ws, { raw: false, header: 1 })
    let rowCount = 0
    aoa.forEach((r: string[], i: number) => {
      if (rowCount >= PREVIEW_MAX_ROWS) return
      const cells: Record<number, { text: string }> = {}
      r.forEach((c: string, j: number) => { cells[j] = { text: String(c ?? "") } })
      o.rows[i] = { cells }
      rowCount++
    })
    out.push(o)
  })
  return out
}

export default class XlsxFileView extends ConvertibleFileView {
  static readonly VIEW_TYPE_ID = "xlsx-view"

  getViewType(): string {
    return XlsxFileView.VIEW_TYPE_ID
  }

  static async getFilePreview(
    plugin: FileViewerPlugin,
    file: TFile | null
  ): Promise<HTMLElement | null> {
    if (!file) return null

    const wrapper = document.createElement("div")
    wrapper.addClass("fv-xlsx-wrapper")

    let buffer: ArrayBuffer
    try {
      buffer = await plugin.app.vault.readBinary(file)
    } catch (e) {
      console.error("Failed to read XLSX file", file.path, e)
      wrapper.createEl("p", {
        text: `(Error reading file: ${file.basename})`,
        cls: "fv-error-message"
      })
      return wrapper
    }

    // ── FileSizeGate: >50MB → metadata-only ──
    if (buffer.byteLength > SIZE_GATE_BYTES) {
      return XlsxFileView.buildMetadataPreview(file, buffer, wrapper)
    }

    // Dynamic import: SheetJS (~500KB) loaded on demand
    const XLSX = await import("xlsx")

    let workbook: { SheetNames: string[]; Sheets: Record<string, unknown> }
    try {
      workbook = XLSX.read(new Uint8Array(buffer), { type: "array" })
    } catch (e) {
      console.error("Failed to parse XLSX file", file.path, e)
      wrapper.createEl("p", {
        text: `(Error parsing file: ${file.basename})`,
        cls: "fv-error-message"
      })
      return wrapper
    }

    const sheetNames = workbook.SheetNames
    if (sheetNames.length === 0) {
      wrapper.createEl("p", { text: "(No sheets)" })
      return wrapper
    }

    // Convert SheetJS workbook → x-data-spreadsheet format
    const xsData = stox(workbook as unknown as { SheetNames: string[]; Sheets: Record<string, unknown> })

    // Dynamic import: x-data-spreadsheet (~197KB) loaded on demand
    // Import from dist (pre-built) to avoid .less file issues
    const xSpreadsheet = (await import("x-data-spreadsheet/dist/xspreadsheet.js")).default

    // Container for the Canvas spreadsheet
    const container = wrapper.createEl("div", { cls: "fv-xlsx-canvas-container" })

    try {
      // Initialize x-data-spreadsheet (Canvas renderer)
      const grid = xSpreadsheet(container, {
        mode: "read",       // read-only
        showToolbar: false,  // no toolbar in preview
        showContextmenu: false,
        view: {
          height: () => 600,
          width: () => container.clientWidth || 800,
        },
        row: { len: PREVIEW_MAX_ROWS, height: 25 },
        col: { len: 52, width: 100, indexWidth: 60, minWidth: 60 },
      })

      // Load data
      grid.loadData(xsData)

      // If multiple sheets, show sheet tabs via x-data-spreadsheet's built-in tabs
      // (it handles this automatically with loadData array)
    } catch (e) {
      console.error("Failed to render xlsx with x-data-spreadsheet", file.path, e)
      // Fallback: show basic info
      wrapper.createEl("p", {
        text: `(Rendering error: ${file.basename})`,
        cls: "fv-error-message"
      })
    }

    // Info footer
    const info = wrapper.createEl("div", { cls: "fv-xlsx-info" })
    const parts: string[] = [
      `${sheetNames.length} sheet${sheetNames.length !== 1 ? "s" : ""}`,
      formatSize(buffer.byteLength)
    ]
    info.createEl("span", { text: parts.join(" · ") })

    return wrapper
  }

  /**
   * Metadata-only preview for files >50MB.
   * Shows file info without parsing cell data (saves memory and bandwidth).
   */
  private static buildMetadataPreview(
    file: TFile,
    buffer: ArrayBuffer,
    wrapper: HTMLElement
  ): HTMLElement {
    wrapper.addClass("fv-xlsx-metadata")

    const header = wrapper.createEl("div", { cls: "fv-xlsx-metadata-header" })
    header.createEl("span", {
      text: `⚠️ File too large for table preview (${formatSize(buffer.byteLength)})`
    })

    wrapper.createEl("p", {
      text: "This excel file exceeds 50mb. Sheet preview is disabled to avoid freezing Obsidian.",
      cls: "fv-xlsx-metadata-note"
    })

    const info = wrapper.createEl("div", { cls: "fv-xlsx-info" })
    info.createEl("span", { text: `${file.extension.toUpperCase()} · ${formatSize(buffer.byteLength)}` })

    return wrapper
  }

  async getFilePreview(): Promise<HTMLElement | null> {
    return XlsxFileView.getFilePreview(this.plugin, this.file)
  }
}
