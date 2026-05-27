import ConvertibleFileView from "src/core/convertible-file-view"
import DocxerPlugin from "src/main"
import { htmlToMarkdown, TFile } from "obsidian"
import DOMPurify from "dompurify"

/**
 * HTML File View
 * 
 * Preview: Renders HTML in a sandboxed iframe using srcdoc.
 *          Security: sandbox="allow-same-origin" only — no scripts execute.
 *                   DOMPurify sanitizes all content before rendering.
 * Convert: Uses Obsidian's built-in htmlToMarkdown to extract content.
 */

export default class HtmlFileView extends ConvertibleFileView {
  static readonly VIEW_TYPE_ID = "html-view"

  getViewType(): string {
    return HtmlFileView.VIEW_TYPE_ID
  }

  /**
   * Sanitize HTML using DOMPurify.
   * Defense-in-depth: even though the iframe is sandboxed, allow-same-origin
   * means CSS/redirect exfiltration is still possible without sanitization.
   *
   * Fixes three classes of bypass that the old regex sanitizer had:
   *   1. Nested tag injection: `<scr<script>ipt>` (mXSS)
   *   2. SVG/MathML event handlers: onbegin, onend, onrepeat
   *   3. CSS exfiltration: background-image: url(...)
   */
  static sanitizeHTML(html: string): string {
    return DOMPurify.sanitize(html, {
      // Default tag/attr blocklist covers script, iframe, object, embed, form, etc.
      FORBID_TAGS: [
        "style",       // prevent CSS exfiltration via url()
        "math",        // MathML can carry event handlers
        "svg",         // SVG animation elements (set/animate) can execute JS
        "template",    // template content bypasses normal parsing
      ],
      FORBID_ATTR: [
        "style",       // block inline style with url() exfiltration
      ],
      // Strip HTML comments (can hide conditional IE exploits)
      ALLOW_COMMENTS: false,
      // Return sanitized string
      RETURN_TRUSTED_TYPE: false,
    })
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
    let rawHTML: string
    try {
      rawHTML = await plugin.app.vault.read(file)
    } catch (e) {
      console.error("Failed to read HTML file", file.path, e)
      const wrapper = document.createElement("div")
      wrapper.addClass("fv-html-wrapper")
      wrapper.createEl("p", { text: `(Error reading file: ${file.basename})`, cls: "fv-error-message" })
      return wrapper
    }
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
    let rawHTML: string
    try {
      rawHTML = await this.app.vault.read(this.file)
    } catch (e) {
      console.error("Failed to read HTML file", this.file.path, e)
      return `(Error reading file: ${this.file.basename})`
    }

    // Extract body content, strip scripts
    const bodyHTML = HtmlFileView.extractBody(rawHTML)
    const safeHTML = HtmlFileView.sanitizeHTML(bodyHTML)

    // Use Obsidian's built-in HTML→Markdown converter
    const markdown = htmlToMarkdown(safeHTML)
    return markdown.trim() || "(empty HTML document)"
  }
}
