import ConvertibleFileView from "src/core/convertible-file-view"
import DocxerPlugin from "src/main"
import { TFile } from "obsidian"
import DOMPurify from "dompurify"

/**
 * Jupyter Notebook (.ipynb) File View
 * 
 * Preview: Renders notebook cells (code/markdown/raw) with their outputs.
 * Convert: Converts to Markdown — markdown cells as-is, code in fenced blocks.
 * 
 * Jupyter notebook format is JSON with a specific schema.
 * Pure JS implementation — no external libraries needed.
 */

interface NotebookCell {
  cell_type: "code" | "markdown" | "raw"
  source: string[]
  outputs?: NotebookOutput[]
  execution_count?: number | null
  metadata?: Record<string, unknown>
}

interface NotebookOutput {
  output_type: "stream" | "execute_result" | "display_data" | "error"
  text?: string[]
  data?: { [mimeType: string]: string | string[] }
  ename?: string
  evalue?: string
  traceback?: string[]
}

interface NotebookData {
  cells: NotebookCell[]
  metadata?: {
    kernelspec?: { display_name: string }
    language_info?: { name: string; version?: string }
  }
  nbformat?: number
}

function parseNotebook(text: string): NotebookData | null {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function joinSource(source: string[]): string {
  if (Array.isArray(source)) return source.join("")
  return String(source)
}

/**
 * Render a code cell with input and outputs
 */
function renderCodeCell(cell: NotebookCell, container: HTMLElement) {
  const cellDiv = container.createEl("div", { cls: "fv-ipynb-cell fv-ipynb-code" })

  // Cell header
  const execCount = cell.execution_count
  const header = cellDiv.createEl("div", { cls: "fv-ipynb-cell-header" })
  header.textContent = `In [${execCount ?? " "}]:`

  // Cell input
  const inputDiv = cellDiv.createEl("div", { cls: "fv-ipynb-cell-input" })
  const pre = inputDiv.createEl("pre")
  pre.createEl("code", { text: joinSource(cell.source) })

  // Cell outputs
  if (cell.outputs && cell.outputs.length > 0) {
    const outputDiv = cellDiv.createEl("div", { cls: "fv-ipynb-cell-output" })

    for (const output of cell.outputs) {
      renderOutput(output, outputDiv)
    }
  }
}

/**
 * Render a single cell output
 */
function renderOutput(output: NotebookOutput, container: HTMLElement) {
  switch (output.output_type) {
    case "stream":
      if (output.text) {
        const pre = container.createEl("pre", { cls: "fv-ipynb-stream" })
        pre.createEl("code", { text: joinSource(output.text) })
      }
      break

    case "execute_result":
    case "display_data":
      if (output.data) {
        // Priority: text/plain > text/html > image/png > image/jpeg
        if (output.data["text/plain"]) {
          const pre = container.createEl("pre", { cls: "fv-ipynb-plain" })
          pre.createEl("code", { text: asString(output.data["text/plain"]) })
        }
        if (output.data["text/html"]) {
          const wrapper = container.createEl("div", { cls: "fv-ipynb-html" })
          wrapper.innerHTML = DOMPurify.sanitize(asString(output.data["text/html"]))
        }
        if (output.data["image/png"]) {
          const img = container.createEl("img", { cls: "fv-ipynb-img" })
          const data = asString(output.data["image/png"])
          img.src = `data:image/png;base64,${data}`
        }
        if (output.data["image/jpeg"]) {
          const img = container.createEl("img", { cls: "fv-ipynb-img" })
          const data = asString(output.data["image/jpeg"])
          img.src = `data:image/jpeg;base64,${data}`
        }
      }
      break

    case "error": {
      const errDiv = container.createEl("div", { cls: "fv-ipynb-error" })
      if (output.traceback) {
        // traceback items may contain ANSI escape codes — strip them
        const cleaned = output.traceback.map(t => stripAnsi(t)).join("\n")
        const pre = errDiv.createEl("pre")
        pre.createEl("code", { text: cleaned })
      } else if (output.ename || output.evalue) {
        errDiv.createEl("pre", { text: `${output.ename}: ${output.evalue}` })
      }
      break
    }

  }
}

function asString(val: string | string[]): string {
  if (Array.isArray(val)) return val.join("")
  return String(val)
}

/** Strip ANSI escape codes from text */
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*m/g, "")
}

/**
 * Render a markdown cell
 */
function renderMarkdownCell(cell: NotebookCell, container: HTMLElement) {
  const cellDiv = container.createEl("div", { cls: "fv-ipynb-cell fv-ipynb-markdown" })
  const header = cellDiv.createEl("div", { cls: "fv-ipynb-cell-header" })
  header.textContent = "Markdown"

  const contentDiv = cellDiv.createEl("div", { cls: "fv-ipynb-cell-input" })
  // For preview, show raw markdown in a pre block (Obsidian doesn't render inner markdown in views)
  const pre = contentDiv.createEl("pre")
  pre.createEl("code", { text: joinSource(cell.source) })
}

/**
 * Render a raw cell
 */
function renderRawCell(cell: NotebookCell, container: HTMLElement) {
  const cellDiv = container.createEl("div", { cls: "fv-ipynb-cell fv-ipynb-raw" })
  const header = cellDiv.createEl("div", { cls: "fv-ipynb-cell-header" })
  header.textContent = "Raw"

  const contentDiv = cellDiv.createEl("div", { cls: "fv-ipynb-cell-input" })
  const pre = contentDiv.createEl("pre")
  pre.createEl("code", { text: joinSource(cell.source) })
}

export default class JupyterFileView extends ConvertibleFileView {
  static readonly VIEW_TYPE_ID = "jupyter-view"

  getViewType(): string {
    return JupyterFileView.VIEW_TYPE_ID
  }

  static async getFilePreview(plugin: DocxerPlugin, file: TFile | null): Promise<HTMLElement | null> {
    if (!file) return null
    let text: string
    try {
      text = await plugin.app.vault.read(file)
    } catch (e) {
      console.error("Failed to read Jupyter file", file.path, e)
      const wrapper = document.createElement("div")
      wrapper.createEl("p", { text: `(Error reading file: ${file.basename})`, cls: "fv-error-message" })
      return wrapper
    }
    const notebook = parseNotebook(text)
    if (!notebook) {
      const wrapper = document.createElement("div")
      wrapper.createEl("p", { text: "(Invalid notebook JSON)" })
      return wrapper
    }

    const wrapper = document.createElement("div")
    wrapper.addClass("fv-ipynb-wrapper")

    // Notebook info header
    const infoDiv = wrapper.createEl("div", { cls: "fv-ipynb-info" })
    const kernelName = notebook.metadata?.kernelspec?.display_name
    const langName = notebook.metadata?.language_info?.name
    const infoParts: string[] = []
    if (kernelName) infoParts.push(kernelName)
    if (langName) infoParts.push(langName)
    infoParts.push(`${notebook.cells?.length ?? 0} cells`)
    infoDiv.createEl("span", { text: infoParts.join(" · ") })

    // Render cells
    if (notebook.cells) {
      for (const cell of notebook.cells) {
        switch (cell.cell_type) {
          case "code":
            renderCodeCell(cell, wrapper)
            break
          case "markdown":
            renderMarkdownCell(cell, wrapper)
            break
          case "raw":
            renderRawCell(cell, wrapper)
            break
        }
      }
    }

    return wrapper
  }

  async getFilePreview(): Promise<HTMLElement | null> {
    return JupyterFileView.getFilePreview(this.plugin, this.file)
  }

  async getMarkdownContent(attachmentsDirectory: string): Promise<string | null> {
    if (!this.file) return null
    let text: string
    try {
      text = await this.app.vault.read(this.file)
    } catch (e) {
      console.error("Failed to read Jupyter file", this.file.path, e)
      return `(Error reading file: ${this.file.basename})`
    }
    const notebook = parseNotebook(text)
    if (!notebook) return "(invalid notebook JSON)"

    const lines: string[] = []

    if (notebook.cells) {
      for (const cell of notebook.cells) {
        const source = joinSource(cell.source)

        switch (cell.cell_type) {
          case "markdown":
            lines.push(source)
            lines.push("")
            break

          case "code": {
            const lang = notebook.metadata?.language_info?.name ?? ""
            lines.push("```" + lang)
            lines.push(source)
            lines.push("```")
            lines.push("")

            // Include text outputs
            if (cell.outputs) {
              for (const output of cell.outputs) {
                if (output.output_type === "stream" && output.text) {
                  lines.push("```")
                  lines.push(joinSource(output.text))
                  lines.push("```")
                  lines.push("")
                } else if ((output.output_type === "execute_result" || output.output_type === "display_data") && output.data?.["text/plain"]) {
                  lines.push("```")
                  lines.push(asString(output.data["text/plain"]))
                  lines.push("```")
                  lines.push("")
                } else if (output.output_type === "error") {
                  lines.push("```")
                  if (output.traceback) {
                    lines.push(output.traceback.map(t => stripAnsi(t)).join("\n"))
                  } else if (output.ename || output.evalue) {
                    lines.push(`${output.ename}: ${output.evalue}`)
                  }
                  lines.push("```")
                  lines.push("")
                }
              }
            }
            break
          }

          case "raw":
            lines.push("```")
            lines.push(source)
            lines.push("```")
            lines.push("")
            break
        }
      }
    }

    return lines.join("\n").trim() || "(empty notebook)"
  }
}
