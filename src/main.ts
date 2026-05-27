import CsvFileView from "./convertable-file-views/csv"
import DocxFileView from "./convertable-file-views/docx"
import TextFileView, { TEXT_EXTENSIONS } from "./convertable-file-views/text"
import ConvertibleFileView from "./core/convertible-file-view"
import FileViewerEmbedComponent from "./core/docxer-embed-component"
import SettingsManager from "./settings"
import { Plugin, TFile, WorkspaceLeaf } from "obsidian"

// Based on obsidian-docxer's FILETYPE_MAP pattern
// Add new format views here: "ext": FormatFileView
const FILETYPE_MAP: { [key: string]: new(leaf: WorkspaceLeaf, plugin: FileViewerPlugin) => ConvertibleFileView } = {
  "docx": DocxFileView,
  "csv": CsvFileView,
  // TODO: Phase 1
  // "html": HtmlFileView,
  // "htm": HtmlFileView,
  // "ipynb": JupyterFileView,
  // "zip": ZipFileView,
  // TODO: Phase 2
  // "xlsx": XlsxFileView,
  // "pdf": PdfFileView,
  // "epub": EpubFileView,
  // TODO: Phase 3
  // "pptx": PptxFileView,
}

// Extensions already handled by Obsidian or other format views
const SKIP_EXTENSIONS = new Set([
  "md", "csv", "docx",
  "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif",
  "mp3", "wav", "ogg", "flac", "m4a", "aac", "wma",
  "mp4", "webm", "ogv", "avi", "mov",
  "pdf",
])

// Register text file extensions dynamically
for (const ext of TEXT_EXTENSIONS) {
  if (!SKIP_EXTENSIONS.has(ext) && !FILETYPE_MAP[ext]) {
    FILETYPE_MAP[ext] = TextFileView as any
  }
}

export default class FileViewerPlugin extends Plugin {
  settings!: SettingsManager
  
	async onload() {    
    this.settings = new SettingsManager(this)
    await this.settings.loadSettings()
    this.settings.addSettingsTab()

    for (const [fileExtension, viewClass] of Object.entries(FILETYPE_MAP)) {
      this.registerView((viewClass as any).VIEW_TYPE_ID, (leaf) => new viewClass(leaf, this))
      this.registerExtensions([fileExtension], (viewClass as any).VIEW_TYPE_ID)

      // Register embeds
      if (!FileViewerEmbedComponent.isEmbeddable(viewClass)) continue

      ;(this.app as any).embedRegistry.unregisterExtension(fileExtension)
      ;(this.app as any).embedRegistry.registerExtension(fileExtension, (info: any, file: TFile, subpath: string) => new FileViewerEmbedComponent(this, viewClass, info, file, subpath))
    }
	}

  onunload() {}
}
