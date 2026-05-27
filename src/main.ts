import DocxFileView from "./convertable-file-views/docx"
import ConvertibleFileView from "./core/convertible-file-view"
import FileViewerEmbedComponent from "./core/docxer-embed-component"
import SettingsManager from "./settings"
import { Plugin, TFile, WorkspaceLeaf } from "obsidian"

// Based on obsidian-docxer's FILETYPE_MAP pattern
// Add new format views here: "ext": FormatFileView
export const FILETYPE_MAP: { [key: string]: new(leaf: WorkspaceLeaf, plugin: FileViewerPlugin) => ConvertibleFileView } = {
  "docx": DocxFileView,
  // TODO: Phase 1 - pure JS formats
  // "csv": CsvFileView,
  // "html": HtmlFileView,
  // "ipynb": JupyterFileView,
  // "zip": ZipFileView,
  // TODO: Phase 2 - JS library formats
  // "xlsx": XlsxFileView,
  // "pdf": PdfFileView,
  // "epub": EpubFileView,
  // TODO: Phase 3 - markitdown backend formats
  // "pptx": PptxFileView,
}

export default class FileViewerPlugin extends Plugin {
  settings: SettingsManager
  
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
