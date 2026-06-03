import ConvertibleFileView from "src/core/convertible-file-view"
import FileUtils from "src/utils/file-utils"
import ObsidianTurndown from "src/utils/obsidian-turndown"
import { htmlToMarkdown, TFile } from "obsidian"
import MimeUtils from "src/utils/mime-utils"
import FileViewerPlugin from "src/main"

export default class DocxFileView extends ConvertibleFileView {
  static readonly VIEW_TYPE_ID = "docx-view"
  private resizeObserver: ResizeObserver | null = null

  getViewType(): string {
    return DocxFileView.VIEW_TYPE_ID
  }

  static async getFilePreview(plugin: FileViewerPlugin, file: TFile | null): Promise<HTMLElement | null> {
    return (await DocxFileView.createFilePreview(plugin, file)).element
  }

  static async createFilePreview(plugin: FileViewerPlugin, file: TFile | null): Promise<{ element: HTMLElement | null, observer: ResizeObserver | null }> {
    if (!file) return { element: null, observer: null }

    const view = document.createElement("div")

    let fileBuffer: ArrayBuffer
    try {
      fileBuffer = await plugin.app.vault.readBinary(file)
    } catch (e) {
      console.error("Failed to read DOCX file", file.path, e)
      const wrapper = document.createElement("div")
      wrapper.createEl("p", { text: `(Error reading file: ${file.basename})`, cls: "fv-error-message" })
      return { element: wrapper, observer: null }
    }
    const { renderAsync } = await import('docx-preview')
    await renderAsync(fileBuffer, view, view, {
      renderComments: plugin.settings.getSetting("importComments"),
    })

    const docxWrapper = view.querySelector(".docx-wrapper")
    if (!docxWrapper) return { element: view, observer: null }

    const docx = docxWrapper.querySelector(".docx")
    if (!docx) return { element: view, observer: null }

    const observer = new ResizeObserver(() => {
      const scale = Math.min(1, view.clientWidth / docx.clientWidth)
      docxWrapper.style.transform = `scale(${scale})`
    })
    observer.observe(view)

    return { element: view, observer }
  }

  async getFilePreview(): Promise<HTMLElement | null> {
    const { element, observer } = await DocxFileView.createFilePreview(this.plugin, this.file)
    this.resizeObserver = observer
    return element
  }

  async onUnloadFile(file: TFile): Promise<void> {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
      this.resizeObserver = null
    }
    await super.onUnloadFile(file)
  }

  async getMarkdownContent(attachmentsDirectory: string): Promise<string | null> {
    if (!this.file) return null

    // Dynamic import: mammoth (~500KB) is only loaded when converting .docx
    const mammoth = await import('mammoth')

    // Convert DOCX to HTML
    let fileBuffer: ArrayBuffer
    try {
      fileBuffer = await this.app.vault.readBinary(this.file)
    } catch (e) {
      console.error("Failed to read DOCX file", this.file.path, e)
      return `(Error reading file: ${this.file.basename})`
    }
    const embedImageData = this.plugin.settings.getSetting("embedImageData")
    const ignoreAttachments = this.plugin.settings.getSetting("ignoreAttachments")
    
    const conversionOptions: unknown = {
      styleMap: this.plugin.settings.getSetting("importComments") ? ["comment-reference => sup"] : undefined,
    }
    
    /**
     * IMAGE CONVERSION STATE MACHINE
     * Based on settings, handle images in one of three ways:
     * 
     * 1. IGNORE state (ignoreAttachments=true)
     *    - Skip all image processing
     *    - Return placeholder text only
     *    - No files or data created
     * 
     * 2. EMBED state (embedImageData=true, ignoreAttachments=false)
     *    - Convert images to base64 data URLs
     *    - Embed directly in markdown
     *    - No external files created
     * 
     * 3. DEFAULT state (both false)
     *    - Extract images to separate files
     *    - Create attachment folders as configured
     *    - Standard Obsidian behavior
     */
    if (ignoreAttachments) {
      // IGNORE state: Completely skip images
      conversionOptions.convertImage = mammoth.images.imgElement(async (image: unknown) => {
        const altText = image.altText || "image"
        console.debug(`Ignoring image: ${altText}`)
        // Return just the alt text as a placeholder - no image element
        return { src: "", alt: `[Image: ${altText}]` }
      })
    } else if (embedImageData) {
      // EMBED state: Convert to base64 data URLs
      conversionOptions.convertImage = mammoth.images.dataUri
    } else {
      // DEFAULT state: Extract to files
      conversionOptions.convertImage = mammoth.images.imgElement(async (image: unknown) => {
        console.debug(`Extracting image ${image.altText ?? ""}`)
        const imageBinary = await image.read()

        const fallbackFilename = this.plugin.settings.getSetting("fallbackAttachmentName")
        let attachmentFilename = this.file?.name.replace(/\.docx$/, "") ?? ""
        if (this.plugin.settings.getSetting("useImageAltAsFilename"))
          attachmentFilename = image.altText?.replace(/\n/g, " ") ?? ""
        const fileExtension = MimeUtils.EXTENSIONS[image.contentType] ?? "png"

        const path = await FileUtils.createBinary(this.app, attachmentsDirectory, attachmentFilename, fallbackFilename, fileExtension, imageBinary)
        console.debug(`Extracted image to ${path}`)

        return { src: path.contains(" ") ? `<${path}>` : path, alt: attachmentFilename }
      })
    }
    
    const html = await mammoth.convertToHtml({ arrayBuffer: fileBuffer }, conversionOptions)

    // Convert HTML to Markdown
    let markdown
    if (!this.plugin.settings.getSetting("importComments")) {
      markdown = htmlToMarkdown(html.value)
    } else {
      const turndownService = ObsidianTurndown.getService()

      turndownService.addRule('comments-sup', {
        filter: ['sup'],
        replacement: function (content) {
          // [[MS2]](#comment-1) -> MS
          const author = content.match(/\[\[(\D+)\d*\]/)?.[1] ?? "Unknown Author"
          // [[MS2]](#comment-1) -> 2
          const commentNumber = content.match(/(\d+)/)?.[1] ?? "1"
          // [[MS2]](#comment-1) -> comment-1
          const commentId = content.match(/#([^)]+)/)?.[1] ?? "comment-0"

          return ` ([[#^${commentId}|Comment ${author} ${commentNumber}]])`
        }
      })

      // Rule for internal TOC links (links starting with #)
      turndownService.addRule('internalLink', {
        filter: function (node, options) {
          // Check if it's an 'a' tag with an 'href' starting with '#'
          return !!(node.nodeName === 'A' && node.getAttribute('href')?.startsWith('#'))
        },
        replacement: function (content, node: HTMLAnchorElement) {
          const linkText = content.trim()
          if (linkText) return `[[#${linkText}]]`

          // Fallback if link text is empty - try using the href target ID directly
          const href = node.getAttribute('href') || ''
          console.warn(`Internal link with href "${href}" has no text content. Creating link to target ID.`)
          return `[[${href}]]` // Link to the raw href target (e.g., [[#_Toc12345]])
        }
      })

      turndownService.addRule('comments-description-list', {
        filter: ['dl'],
        replacement: function (content) {
          /*
          Comment [MS1]

          Hey [↑](#comment-ref-0)

          Comment [AD2]

          Test comment 2 [↑](#comment-ref-1)
          */
          const comments = content.match(/Comment \[(\D+)\d+\]\n\n[\s\S]+? \[.\]\(#comment-ref-(\d+)\)/g)
          if (!comments) return content

          const commentsCallouts = comments.map((comment) => {
            const author = comment.match(/Comment \[(\D+)\d+\]/)?.[1] ?? "Unknown Author"
            const number = comment.match(/Comment \[\D+(\d+)\]/)?.[1] ?? "1"
            const id = comment.match(/Comment \[\D+\d+\]\n\n[\s\S]+? \[.\]\(#comment-ref-(\d+)\)/)?.[1] ?? "0"
            const content = comment.match(/Comment \[\D+\d+\]\n\n([\s\S]+?) \[.\]\(#comment-ref-\d+\)/)?.[1] ?? ""

            return (
                `>[!QUOTE] **Comment ${author} ${number}**\n`
              + `> ${content}\n`
              + `^comment-${id}`
            )
          })

          return "---" + "\n\n" + commentsCallouts.join("\n\n")
        }
      })

      markdown = turndownService.turndown(html.value)
    }

    return markdown
  }
}