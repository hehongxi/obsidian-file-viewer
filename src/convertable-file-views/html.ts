import ConvertibleFileView from "src/core/convertible-file-view"
import DocxerPlugin from "src/main"
import { htmlToMarkdown, TFile } from "obsidian"

/**
 * HTML File View
 * 
 * Preview: Renders HTML in a sandboxed iframe using srcdoc.
 *          Security: sandbox="allow-same-origin" only — no scripts execute.
 * Convert: Uses Obsidian's built-in htmlToMarkdown to extract content.
 * 
 * Pure JS implementation — no external libraries needed.
 */

export default class HtmlFileView extends ConvertibleFileView {
  static readonly VIEW_TYPE_ID = "html-view"

  getViewType(): string {
    return HtmlFileView.VIEW_TYPE_ID
  }

  /**
   * Sanitize HTML for sandboxed rendering.
   * Removes <script>, <iframe>, <object>, <embed>, <form>, event handlers.
   */
  static sanitizeHTML(html: string): string {
    // Remove script tags and their content
    let safe = html.replace(/<script[\s\S]*?<\/script>/gi, "")
    // Remove noscript
    safe = safe.replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    // Remove iframe/object/embed
    safe = safe.replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    safe = safe.replace(/<object[\s\S]*?<\/object>/gi, "")
    safe = safe.replace(/<embed[^>]*>/gi, "")
    // Remove form elements (prevent data exfiltration)
    safe = safe.replace(/<form[\s\S]*?<\/form>/gi, "")
    // Remove inline event handlers (onclick, onload, etc.)
    safe = safe.replace(/\s+on\w+\s*=\s*(['"])[\s\S]*?\1/gi, "")
    safe = safe.replace(/\s+on\w+\s*=\s*[^\s>]*/gi, "")
    return safe
  }

  /**
   * Extract the body content from full HTML, or return the whole thing if no body.
   */
  static extractBody(html: string): string {
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
    return bodyMatch ? bodyMatch[1] : html
  }

  static async getFilePreview(plugin: DocxerPlugin, file: TFile | null): Promise<HTMLElement | null> {
    if (!file) return null
    const rawHTML = await plugin.app.vault.read(file)
    const safeHTML = HtmlFileView.sanitizeHTML(rawHTML)

    const wrapper = document.createElement("div")
    wrapper.addClass("fv-html-wrapper")

    // Render in sandboxed iframe — no script execution
    const iframe = document.createElement("iframe")
    iframe.addClass("fv-html-iframe")
    iframe.setAttribute("sandbox", "allow-same-origin")
    iframe.setAttribute("loading", "lazy")
    iframe.setAttribute("title", `Preview: ${file.basename}`)
    // srcdoc is safe — content is sandboxed
    iframe.srcdoc = safeHTML

    wrapper.appendChild(iframe)

    // Auto-resize iframe to content height
    iframe.addEventListener("load", () => {
      try {
        const height = iframe.contentDocument?.documentElement?.scrollHeight
        if (height && height > 0) {
          iframe.style.height = `${Math.min(height + 20, 2000)}px`
        }
      } catch {
        // Cross-origin restriction — use default height
      }
    })

    return wrapper
  }

  async getFilePreview(): Promise<HTMLElement | null> {
    return HtmlFileView.getFilePreview(this.plugin, this.file)
  }

  async getMarkdownContent(attachmentsDirectory: string): Promise<string | null> {
    if (!this.file) return null
    const rawHTML = await this.app.vault.read(this.file)

    // Extract body content, strip scripts
    const bodyHTML = HtmlFileView.extractBody(rawHTML)
    const safeHTML = HtmlFileView.sanitizeHTML(bodyHTML)

    // Use Obsidian's built-in HTML→Markdown converter
    const markdown = htmlToMarkdown(safeHTML)
    return markdown.trim() || "(empty HTML document)"
  }
}
