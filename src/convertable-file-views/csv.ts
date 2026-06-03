import ConvertibleFileView from "src/core/convertible-file-view"
import DocxerPlugin from "src/main"
import { TFile } from "obsidian"
import * as Papa from "papaparse"

/**
 * CSV File View
 * 
 * Preview: Renders CSV as an HTML table with alternating row colors.
 * Convert: Converts CSV to Markdown table with GFM alignment via Papa Parse.
 * 
 * Uses Papa Parse for robust, spec-compliant CSV parsing (RFC 4180).
 */

type Alignment = "left" | "center" | "right" | "none"

function isNumeric(val: string): boolean {
  // Match integers, decimals, scientific notation, percentages, currency symbols
  const cleaned = val.replace(/^[$\u00a3\u00a5\u20ac\u00a2\s%-]+|[%\s]+$/g, "")
  if (cleaned === "") return false
  return !isNaN(Number(cleaned)) && isFinite(Number(cleaned))
}

/**
 * Determine GFM alignment for each column by scanning data rows.
 * Numbers → right-aligned, text → left-aligned, all-empty → no alignment.
 */
function getColumnAlignments(rows: string[][], headerRowCount: number): Alignment[] {
  if (rows.length <= headerRowCount) {
    return rows[0]?.map(() => "none") ?? []
  }

  const colCount = rows[0].length
  const alignments: Alignment[] = []

  for (let col = 0; col < colCount; col++) {
    let allNumeric = true
    let allEmpty = true

    for (let row = headerRowCount; row < rows.length; row++) {
      const val = (rows[row][col] ?? "").trim()
      if (val !== "") {
        allEmpty = false
        if (!isNumeric(val)) {
          allNumeric = false
        }
      }
    }

    if (allEmpty) {
      alignments.push("none")
    } else if (allNumeric) {
      alignments.push("right")
    } else {
      alignments.push("left")
    }
  }

  return alignments
}

function alignmentToGFM(a: Alignment): string {
  switch (a) {
    case "left":   return ":---"
    case "center": return ":---:"
    case "right":  return "---:"
    default:       return "---"
  }
}

export default class CsvFileView extends ConvertibleFileView {
  static readonly VIEW_TYPE_ID = "csv-view"

  getViewType(): string {
    return CsvFileView.VIEW_TYPE_ID
  }

  /**
   * Parse CSV text into a 2D array using Papa Parse (RFC 4180 compliant).
   * Handles quoted fields, escaped quotes, embedded delimiters, multi-line fields.
   */
  static parseCSV(text: string): string[][] {
    const result = Papa.parse<string[]>(text, {
      header: false,
      skipEmptyLines: true,
      transform: (value: string) => value.trim(),
    })
    return result.data
  }

  /**
   * Build an HTML table from parsed CSV rows.
   */
  static buildHTMLTable(rows: string[][]): HTMLElement {
    const wrapper = document.createElement("div")
    wrapper.addClass("fv-csv-wrapper")

    if (rows.length === 0) {
      wrapper.createEl("p", { text: "(Empty CSV)" })
      return wrapper
    }

    const table = wrapper.createEl("table", { cls: "fv-csv-table" })

    // Header row (first row)
    const thead = table.createEl("thead")
    const headerRow = thead.createEl("tr")
    for (const cell of rows[0]) {
      headerRow.createEl("th", { text: cell })
    }

    // Data rows
    if (rows.length > 1) {
      const tbody = table.createEl("tbody")
      for (let i = 1; i < rows.length; i++) {
        const tr = tbody.createEl("tr")
        // Pad rows to match header width
        const rowData = rows[i]
        const cols = rows[0].length
        for (let j = 0; j < cols; j++) {
          tr.createEl("td", { text: j < rowData.length ? rowData[j] : "" })
        }
      }
    }

    // Row count footer
    const info = wrapper.createEl("div", { cls: "fv-csv-info" })
    info.createEl("span", { text: `${rows.length - 1} rows × ${rows[0].length} columns` })

    return wrapper
  }

  static async getFilePreview(plugin: DocxerPlugin, file: TFile | null): Promise<HTMLElement | null> {
    if (!file) return null
    let text: string
    try {
      text = await plugin.app.vault.read(file)
    } catch (e) {
      console.error("Failed to read CSV file", file.path, e)
      const wrapper = document.createElement("div")
      wrapper.createEl("p", { text: `(Error reading file: ${file.basename})`, cls: "fv-error-message" })
      return wrapper
    }
    const rows = CsvFileView.parseCSV(text)
    return CsvFileView.buildHTMLTable(rows)
  }

  async getFilePreview(): Promise<HTMLElement | null> {
    return CsvFileView.getFilePreview(this.plugin, this.file)
  }

  async getMarkdownContent(attachmentsDirectory: string): Promise<string | null> {
    if (!this.file) return null
    let text: string
    try {
      text = await this.app.vault.read(this.file)
    } catch (e) {
      console.error("Failed to read CSV file", this.file.path, e)
      return `(Error reading file: ${this.file.basename})`
    }

    const rows = CsvFileView.parseCSV(text)
    if (rows.length === 0) return "(empty CSV)"

    // Normalize all rows to same column count
    const maxCols = Math.max(...rows.map(r => r.length))
    const normalized = rows.map(row => {
      const padded = [...row]
      while (padded.length < maxCols) padded.push("")
      return padded
    })

    // GFM alignment based on column content types
    const alignments = getColumnAlignments(normalized, 1)

    const lines: string[] = []

    // Header row
    lines.push("| " + normalized[0].join(" | ") + " |")

    // Separator row with alignment
    lines.push("| " + alignments.map(alignmentToGFM).join(" | ") + " |")

    // Body rows
    for (let i = 1; i < normalized.length; i++) {
      lines.push("| " + normalized[i].join(" | ") + " |")
    }

    return lines.join("\n")
  }
}
