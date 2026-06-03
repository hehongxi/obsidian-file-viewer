import ConvertibleFileView from "src/core/convertible-file-view"
import FileViewerPlugin from "src/main"
import { TFile } from "obsidian"

/**
 * XLSX / Excel File View
 * 
 * Preview: Sheet tabs + first sheet rendered as HTML table (first 100 rows).
 * Convert: All sheets → Markdown tables, separated by H2 headers.
 * 
 * Uses SheetJS (xlsx) via dynamic import (~500KB, loaded on demand).
 * Files >50MB degrade to metadata-only mode (sheet names, no table data).
 * 
 * Supports: .xlsx (Office Open XML), .xls (legacy binary)
 */

/** Max rows to render in preview (safety limit) */
const PREVIEW_MAX_ROWS = 100

/** File size threshold for metadata-only mode (50MB) */
const SIZE_GATE_BYTES = 50 * 1024 * 1024

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B"
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB"
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB"
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB"
}

/** Escape pipe characters in cell values for Markdown tables */
function escapePipe(val: string): string {
  return val.replace(/\|/g, "\\|").replace(/\n/g, " ")
}

/**
 * Build an HTML table from a 2D array of cells.
 * First row is treated as header.
 */
function buildHTMLTable(
  rows: string[][],
  maxRows: number,
  wrapper: HTMLElement
): void {
  if (rows.length === 0) {
    wrapper.createEl("p", { text: "(Empty sheet)" })
    return
  }

  const headerRow = rows[0]
  const dataRows = rows.slice(1, maxRows)

  const table = wrapper.createEl("table", { cls: "fv-xlsx-table" })

  // Header
  const thead = table.createEl("thead")
  const tr = thead.createEl("tr")
  for (const cell of headerRow) {
    tr.createEl("th", { text: cell })
  }

  // Data rows
  if (dataRows.length > 0) {
    const tbody = table.createEl("tbody")
    const numCols = headerRow.length
    for (const row of dataRows) {
      const dataTr = tbody.createEl("tr")
      for (let j = 0; j < numCols; j++) {
        dataTr.createEl("td", { text: j < row.length ? row[j] : "" })
      }
    }
  }

  // Truncation notice
  if (rows.length - 1 > maxRows) {
    const notice = wrapper.createEl("div", { cls: "fv-xlsx-truncated" })
    notice.createEl("span", {
      text: `Showing ${maxRows} of ${rows.length - 1} data rows`
    })
  }
}

/**
 * Render sheet tabs (visual switcher — display-only, no JS interaction).
 */
function buildSheetTabs(
  sheetNames: string[],
  activeIndex: number,
  wrapper: HTMLElement
): void {
  const tabsDiv = wrapper.createEl("div", { cls: "fv-xlsx-tabs" })
  for (let i = 0; i < sheetNames.length; i++) {
    const tab = tabsDiv.createEl("span", {
      text: sheetNames[i],
      cls: "fv-xlsx-tab" + (i === activeIndex ? " fv-xlsx-tab-active" : "")
    })
    tab.setAttribute("data-sheet-index", String(i))
  }
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

    let workbook: unknown
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

    const sheetNames: string[] = workbook.SheetNames
    if (sheetNames.length === 0) {
      wrapper.createEl("p", { text: "(No sheets)" })
      return wrapper
    }

    // Sheet tabs
    buildSheetTabs(sheetNames, 0, wrapper)

    // First sheet preview
    const firstSheet = workbook.Sheets[sheetNames[0]]
    const csvData: string[][] = XLSX.utils.sheet_to_json(firstSheet, {
      header: 1,
      defval: "",
      blankrows: false
    })

    const tableWrapper = wrapper.createEl("div", { cls: "fv-xlsx-table-wrapper" })
    buildHTMLTable(csvData, PREVIEW_MAX_ROWS, tableWrapper)

    // Info footer
    const info = wrapper.createEl("div", { cls: "fv-xlsx-info" })
    const totalRows = csvData.length > 0 ? csvData.length - 1 : 0
    const totalCols = csvData.length > 0 ? csvData[0].length : 0
    const parts: string[] = [
      `${sheetNames.length} sheet${sheetNames.length !== 1 ? "s" : ""}`,
      `${totalRows} rows × ${totalCols} columns`,
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
      text: "This excel file exceeds 50mb. Sheet preview is disabled to avoid freezing Obsidian. You can still convert it to Markdown in smaller chunks via an external tool.",
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