import ConvertibleFileView from "src/core/convertible-file-view"
import DocxerPlugin from "src/main"
import { TFile } from "obsidian"

/**
 * Image File View
 * 
 * Preview: Renders an <img> tag with lazy loading via IntersectionObserver.
 * Convert: Outputs base64-embedded markdown image link.
 * 
 * Handles: .jpg, .jpeg, .png, .gif, .webp, .bmp, .svg
 * Pure JS implementation — no external libraries needed.
 */

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"]

/** MIME type mapping for image formats */
const IMAGE_MIME: { [key: string]: string } = {
  "jpg": "image/jpeg",
  "jpeg": "image/jpeg",
  "png": "image/png",
  "gif": "image/gif",
  "webp": "image/webp",
  "bmp": "image/bmp",
  "svg": "image/svg+xml",
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B"
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB"
  return (bytes / (1024 * 1024)).toFixed(1) + " MB"
}

/** Convert ArrayBuffer to base64 string */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/** Create a lazy-loaded image element with IntersectionObserver */
function createLazyImage(resourcePath: string, altText: string): HTMLImageElement {
  const img = document.createElement("img")
  img.addClass("fv-image-preview")
  img.alt = altText
  img.setAttribute("data-src", resourcePath)

  // Placeholder while loading
  img.style.minHeight = "200px"
  img.style.objectFit = "contain"
  img.style.maxWidth = "100%"

  // Lazy load via IntersectionObserver
  const observer = new IntersectionObserver(
    (entries, obs) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const el = entry.target as HTMLImageElement
          const src = el.getAttribute("data-src")
          if (src) {
            el.src = src
            el.removeAttribute("data-src")
          }
          obs.unobserve(el)
        }
      }
    },
    { rootMargin: "200px" }
  )

  observer.observe(img)
  return img
}

export { IMAGE_EXTENSIONS }

export default class ImageFileView extends ConvertibleFileView {
  static readonly VIEW_TYPE_ID = "fv-image-view"

  getViewType(): string {
    return ImageFileView.VIEW_TYPE_ID
  }

  static async getFilePreview(plugin: DocxerPlugin, file: TFile | null): Promise<HTMLElement | null> {
    if (!file) return null

    const wrapper = document.createElement("div")
    wrapper.addClass("fv-image-wrapper")

    // File name header
    const header = wrapper.createEl("div", { cls: "fv-image-header" })
    header.createEl("span", { cls: "fv-image-filename", text: file.basename })

    // Image container
    const imgContainer = wrapper.createEl("div", { cls: "fv-image-container" })

    try {
      const resourcePath = plugin.app.vault.getResourcePath(file)
      const img = createLazyImage(resourcePath, file.basename)
      imgContainer.appendChild(img)

      // Error fallback
      img.onerror = () => {
        img.style.display = "none"
        const errorMsg = imgContainer.createEl("div", { cls: "fv-image-error" })
        errorMsg.textContent = `(Cannot preview: ${file.name})`
      }
    } catch (e) {
      console.error("Failed to create image preview", file.path, e)
      const errorMsg = imgContainer.createEl("div", { cls: "fv-image-error" })
      errorMsg.textContent = `(Error loading: ${file.name})`
    }

    // File info footer
    const info = wrapper.createEl("div", { cls: "fv-image-info" })
    const ext = file.extension.toUpperCase()
    const size = file.stat?.size ? formatFileSize(file.stat.size) : "unknown size"
    info.createEl("span", { text: `${ext} · ${size}` })

    return wrapper
  }

  async getFilePreview(): Promise<HTMLElement | null> {
    return ImageFileView.getFilePreview(this.plugin, this.file)
  }

  async getMarkdownContent(attachmentsDirectory: string): Promise<string | null> {
    if (!this.file) return null

    try {
      // Read file as binary and convert to base64 data URI
      const buffer = await this.app.vault.readBinary(this.file)
      const base64 = arrayBufferToBase64(buffer)
      const mime = IMAGE_MIME[this.file.extension.toLowerCase()] || "image/png"

      return `![${this.file.basename}](data:${mime};base64,${base64})`
    } catch (e) {
      console.error("Failed to read image for markdown conversion", this.file.path, e)
      // Fallback: simple markdown link without base64 embed
      return `![[${this.file.name}]]`
    }
  }
}
