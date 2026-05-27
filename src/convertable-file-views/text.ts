import ConvertibleFileView from "src/core/convertible-file-view"
import DocxerPlugin from "src/main"
import { TFile } from "obsidian"

/**
 * Plain Text / Code File View
 * 
 * Preview: Renders text content in a styled code block with monospace font.
 * Convert: Wraps content in a fenced code block with language tag.
 * 
 * Handles: .txt, .json, .xml, .yaml, .yml, .toml, .ini, .cfg, .conf,
 *          .log, .env, .gitignore, .dockerfile, .sh, .bat, .py, .js, .ts,
 *          .css, .html (as source), .sql, .r, .rb, .go, .rs, .java, .c, .cpp, .h
 * 
 * Pure JS implementation — no external libraries needed.
 */

/** Map file extension to fenced code block language tag */
const EXT_TO_LANG: { [key: string]: string } = {
  "txt": "",
  "text": "",
  "json": "json",
  "xml": "xml",
  "yaml": "yaml",
  "yml": "yaml",
  "toml": "toml",
  "ini": "ini",
  "cfg": "",
  "conf": "",
  "log": "",
  "env": "",
  "sh": "bash",
  "bash": "bash",
  "zsh": "zsh",
  "bat": "batch",
  "cmd": "batch",
  "ps1": "powershell",
  "py": "python",
  "pyw": "python",
  "js": "javascript",
  "ts": "typescript",
  "jsx": "jsx",
  "tsx": "tsx",
  "css": "css",
  "scss": "scss",
  "less": "less",
  "sql": "sql",
  "r": "r",
  "rb": "ruby",
  "go": "go",
  "rs": "rust",
  "java": "java",
  "c": "c",
  "cpp": "cpp",
  "h": "c",
  "hpp": "cpp",
  "cs": "csharp",
  "swift": "swift",
  "kt": "kotlin",
  "dart": "dart",
  "lua": "lua",
  "php": "php",
  "perl": "perl",
  "pl": "perl",
  "graphql": "graphql",
  "dockerfile": "dockerfile",
  "makefile": "makefile",
  "cmake": "cmake",
  "gitignore": "",
  "gitattributes": "",
  "editorconfig": "",
  "prettierrc": "json",
  "eslintrc": "json",
}

/** Extensions that this view handles */
export const TEXT_EXTENSIONS = Object.keys(EXT_TO_LANG)

export default class TextFileView extends ConvertibleFileView {
  static readonly VIEW_TYPE_ID = "text-view"

  getViewType(): string {
    return TextFileView.VIEW_TYPE_ID
  }

  /** Get the file extension in lowercase */
  private getExt(): string {
    if (!this.file) return "txt"
    return this.file.extension.toLowerCase()
  }

  /** Get language tag for fenced code block */
  private getLangTag(): string {
    return EXT_TO_LANG[this.getExt()] ?? ""
  }

  static async getFilePreview(plugin: DocxerPlugin, file: TFile | null): Promise<HTMLElement | null> {
    if (!file) return null
    const text = await plugin.app.vault.read(file)
    const ext = file.extension.toLowerCase()
    const lang = EXT_TO_LANG[ext] ?? ""

    const wrapper = document.createElement("div")
    wrapper.addClass("fv-text-wrapper")

    // Try to pretty-print JSON
    let displayText = text
    if (ext === "json") {
      try {
        displayText = JSON.stringify(JSON.parse(text), null, 2)
      } catch {
        // keep original if parse fails
      }
    }

    // Language label
    if (lang) {
      const label = wrapper.createEl("div", { cls: "fv-text-lang" })
      label.createEl("span", { text: lang, cls: "fv-text-lang-tag" })
    }

    // Code block
    const pre = wrapper.createEl("pre", { cls: "fv-text-content" })
    pre.createEl("code", { text: displayText })

    // File info
    const info = wrapper.createEl("div", { cls: "fv-text-info" })
    const lines = text.split("\n").length
    const bytes = new TextEncoder().encode(text).length
    info.createEl("span", { text: `${lines} lines · ${formatBytes(bytes)}` })

    return wrapper
  }

  async getFilePreview(): Promise<HTMLElement | null> {
    return TextFileView.getFilePreview(this.plugin, this.file)
  }

  async getMarkdownContent(attachmentsDirectory: string): Promise<string | null> {
    if (!this.file) return null
    const text = await this.app.vault.read(this.file)
    const lang = this.getLangTag()

    // JSON: pretty-print
    let content = text
    if (this.getExt() === "json") {
      try {
        content = JSON.stringify(JSON.parse(text), null, 2)
      } catch {
        // keep original
      }
    }

    return "```" + lang + "\n" + content + "\n```"
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B"
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB"
  return (bytes / (1024 * 1024)).toFixed(1) + " MB"
}
