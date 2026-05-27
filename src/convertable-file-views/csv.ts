import ConvertibleFileView from "src/core/convertible-file-view"
import DocxerPlugin from "src/main"
import { htmlToMarkdown, TFile } from "obsidian"

/**
 * CSV File View
 * 
 * Preview: Renders CSV as an HTML table with alternating row colors.
 * Convert: Converts CSV to Markdown table format.
 * 
 * Pure JS implementation — no external libraries needed.
 */

export default class CsvFileView extends ConvertibleFileView {
  static readonly VIEW_TYPE_ID = "csv-view"

  getViewType(): string {
    return CsvFileView.VIEW_TYPE_ID
  }

  /**
   * Parse CSV text into a 2D array, handling quoted fields with commas/newlines.
   */
  static parseCSV(text: string): string[][] {
    const rows: string[][] = []
    let current: string[] = []
    let field = ""
    let inQuotes = false

    for (let i = 0; i < text.length; i++) {
      const ch = text[i]

      if (inQuotes) {
        if (ch === '"') {
          // Check for escaped quote ""
          if (i + 1 < text.length && text[i + 1] === '"') {
            field += '"'
            i++ // skip next quote
          } else {
            inQuotes = false
          }
        } else {
          field += ch
        }
      } else {
        if (ch === '"') {
          inQuotes = true
        } else if (ch === ',') {
          current.push(field.trim())
          field = ""
        } else if (ch === '\n' || ch === '\r') {
          current.push(field.trim())
          field = ""
          if (current.length > 0 && !(current.length === 1 && current[0] === "")) {
            rows.push(current)
          }
          current = []
          if (ch === '\r' && i + 1 < text.length && text[i + 1] === '\n') i++ // skip \n in \r\n
        } else {
          field += ch
        }
      }
    }

    // Last field/row
    if (field || current.length > 0) {
      current.push(field.trim())
      if (current.length > 0 && !(current.length === 1 && current[0] === "")) {
        rows.push(current)
      }
    }

    return rows
  }

  /**
   * Build an HTML table from parsed CSV rows.
   */
  static buildHTMLTable(rows: string[][]): HTMLElement {
    const wrapper = document.createElement("div")
    wrapper.addClass("fv-csv-wrapper")

    if (rows.length === 0) {
      wrapper.createEl("p", { text: "(empty CSV)" })
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

    // Convert to Markdown table
    const maxCols = Math.max(...rows.map(r => r.length))
    const lines: string[] = []

    // Normalize all rows to same column count
    const normalized = rows.map(row => {
      const padded = [...row]
      while (padded.length < maxCols) padded.push("")
      return padded
    })

    // Header
    lines.push("| " + normalized[0].join(" | ") + " |")
    lines.push("| " + normalized[0].map(() => "---").join(" | ") + " |")

    // Body
    for (let i = 1; i < normalized.length; i++) {
      lines.push("| " + normalized[i].join(" | ") + " |")
    }

    return lines.join("\n")
  }
}
