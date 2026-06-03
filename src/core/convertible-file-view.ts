import { EditableFileView, Notice, TFile, WorkspaceLeaf } from "obsidian"
import DocxerPlugin from "src/main"
import FileUtils from "src/utils/file-utils"
import { FileSizeGate, PreviewTier } from "./file-size-gate"

export default abstract class ConvertibleFileView extends EditableFileView {
  plugin: DocxerPlugin
  fileContent: string
  header: HTMLElement | null = null
  content: HTMLElement | null = null
  /** Current preview tier for the loaded file — set in onLoadFile before getFilePreview(). */
  previewTier: PreviewTier = "full"

	constructor(leaf: WorkspaceLeaf, plugin: DocxerPlugin) {
		super(leaf)
    this.plugin = plugin
	}

	getDisplayText(): string {
		return this.file?.basename ?? "???"
	}

	getContext(file?: TFile) {
		return file?.path ?? this.file?.path ?? ""
	}

  async onOpen() {
		await super.onOpen()

    this.header = document.createElement("div")
    this.header.id = "docxer-header"

    const text = document.createElement("span")
    text.innerText = "This is a preview. To edit, convert it to Markdown."
    this.header.appendChild(text)

    const convertButton = document.createElement("button")
    convertButton.id = "docxer-convert-button"
    convertButton.innerText = "Convert"
    convertButton.onclick = () => this.convertFile()
    this.header.appendChild(convertButton)

    this.containerEl.insertAfter(this.header, this.containerEl.firstChild)
  }

	async onClose() {
		await super.onClose()
    if (this.header) this.header.remove()
	}

  abstract getFilePreview(): Promise<HTMLElement | null>
	async onLoadFile(file: TFile) {
		await super.onLoadFile(file)

    // Phase 0: check file size before loading preview
    this.previewTier = await FileSizeGate.getPreviewTier(file)

    if (this.previewTier === "metadata") {
      this.content = this.createMetadataPreview(file)
    } else {
      this.content = await this.getFilePreview()
    }

    if (this.content) {
      this.content.setAttribute("data-fv-tier", this.previewTier)
      this.contentEl.appendChild(this.content)
    }
	}

	async onUnloadFile(file: TFile) {
		await super.onUnloadFile(file)
    if (this.content) this.content.remove()
	}

	clear(): void {}

	setViewData(data: string): void {
    this.fileContent = data
	}

	getViewData(): string {
    return this.fileContent
	}

  /**
   * Create a metadata-only preview for files >200MB.
   * Shows filename, size, modification time — no content loaded.
   */
  private createMetadataPreview(file: TFile): HTMLElement {
    const wrapper = document.createElement("div")
    wrapper.className = "fv-metadata-preview"

    const title = document.createElement("h2")
    title.textContent = file.basename
    wrapper.appendChild(title)

    const table = document.createElement("table")
    table.className = "fv-metadata-table"

    const sizeMB = (file.stat.size / (1024 * 1024)).toFixed(1)
    const mtime = new Date(file.stat.mtime).toLocaleString()
    const rows: [string, string][] = [
      ["Path", file.path],
      ["Size", `${sizeMB} MB`],
      ["Modified", mtime],
    ]
    for (const [label, value] of rows) {
      const tr = document.createElement("tr")
      const tdLabel = document.createElement("td")
      tdLabel.textContent = label
      tdLabel.className = "fv-metadata-label"
      const tdValue = document.createElement("td")
      tdValue.textContent = value
      tr.appendChild(tdLabel)
      tr.appendChild(tdValue)
      table.appendChild(tr)
    }
    wrapper.appendChild(table)

    const note = document.createElement("p")
    note.className = "fv-metadata-note"
    note.textContent = "File too large for preview (>200mb). Convert to Markdown to view content."
    wrapper.appendChild(note)

    return wrapper
  }

  abstract getMarkdownContent(attachmentsDirectory: string): Promise<string | null>
  private async convertFile() {
    if (!this.file) return

    const convertedFilePath = FileUtils.toUnixPath(this.file.path).replace(/\.[^.]*$/, ".md")
    if (this.app.vault.getAbstractFileByPath(convertedFilePath)) {
      new Notice("A file with the same name already exists.")
      return
    }

    // Get the directory where the attachments will be saved
    const attachmentsDirectory = {
      "vault": "",
      "custom": this.plugin.settings.getSetting("customAttachmentsFolder"),
      "same": FileUtils.dirname(this.file.path),
      "subfolder": FileUtils.joinPath(FileUtils.dirname(this.file.path), this.plugin.settings.getSetting("customAttachmentsFolder"))
    }[this.plugin.settings.getSetting("attachmentsFolder")]

    // Convert the file to markdown
    const markdown = await this.getMarkdownContent(attachmentsDirectory)
    if (!markdown) {
      new Notice("Error converting file to Markdown.")
      return
    }

    // Create the converted markdown file
    const convertedFile = await this.app.vault.create(convertedFilePath, markdown)
    void this.leaf.openFile(convertedFile)

    // Delete the original file if the setting is enabled
    if (this.plugin.settings.getSetting("deleteFileAfterConversion"))
      void this.app.vault.delete(this.file)
  }
}