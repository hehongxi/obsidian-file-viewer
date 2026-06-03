import CsvFileView from "./convertable-file-views/csv"
import DocFileView from "./convertable-file-views/doc"
import DocxFileView from "./convertable-file-views/docx"
import PptxFileView from "./convertable-file-views/pptx"
import TextFileView, { TEXT_EXTENSIONS } from "./convertable-file-views/text"
import XlsxFileView from "./convertable-file-views/xlsx"
import ZipFileView from "./convertable-file-views/zip"
import ConvertibleFileView from "./core/convertible-file-view"
import FileViewerEmbedComponent from "./core/file-viewer-embed-component"
import SettingsManager from "./settings"
import { Plugin, TFile, WorkspaceLeaf } from "obsidian"

/** Internal embed registry — not part of the public API. */
interface EmbedRegistry {
  unregisterExtension(ext: string): void
  registerExtension(ext: string, factory: (info: unknown, file: TFile, subpath: string) => unknown): void
}

// Format registry: maps file extension → View class
// Full conversion (Preview + Convert to Markdown): docx, doc, csv, text
// Preview only: xlsx, pptx, zip
const FILETYPE_MAP: { [key: string]: new(leaf: WorkspaceLeaf, plugin: FileViewerPlugin) => ConvertibleFileView } = {
  "docx": DocxFileView,
  "doc": DocFileView,
  "csv": CsvFileView,
  "zip": ZipFileView,
  // Excel — preview only
  "xlsx": XlsxFileView,
  "xls": XlsxFileView,
  // PDF — preview + convert
  // PowerPoint — preview only
  "pptx": PptxFileView,
}

// Extensions already handled by Obsidian or other format views
const SKIP_EXTENSIONS = new Set([
  "md", "csv", "docx", "html", "htm",
  // Image formats — native in Obsidian (Chromium-based)
  "jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "ico", "avif", "tiff", "tif",
  // Audio — native in Obsidian
  "mp3", "wav", "ogg", "flac", "m4a", "aac", "wma", "opus",
  // Video — native in Obsidian
  "mp4", "webm", "ogv", "avi", "mov", "mkv",
  // Spreadsheets — handled by XlsxFileView
  "xlsx", "xls",
  "pdf",
])

// Register text file extensions dynamically
for (const ext of TEXT_EXTENSIONS) {
  if (!SKIP_EXTENSIONS.has(ext) && !FILETYPE_MAP[ext]) {
    FILETYPE_MAP[ext] = TextFileView
  }
}

export default class FileViewerPlugin extends Plugin {
  settings!: SettingsManager
  /** Extensions registered via the internal embedRegistry (for cleanup on unload). */
  private embedExtensions: string[] = []

  async onload() {
    this.settings = new SettingsManager(this)
    await this.settings.loadSettings()
    this.settings.addSettingsTab()

    for (const [fileExtension, viewClass] of Object.entries(FILETYPE_MAP)) {
      this.registerView((viewClass as unknown).VIEW_TYPE_ID, (leaf) => new viewClass(leaf, this))
      this.registerExtensions([fileExtension], (viewClass as unknown).VIEW_TYPE_ID)

      // Register embeds (uses Obsidian's internal embedRegistry — not a public API).
      // Wrapped in try-catch so the plugin degrades gracefully if the API changes.
      if (!FileViewerEmbedComponent.isEmbeddable(viewClass)) continue
      this.registerEmbed(fileExtension, viewClass)
    }
  }

  /**
   * Safely register an embed via the internal embedRegistry.
   * If the API is missing or throws, embed support is silently skipped.
   */
  private registerEmbed(fileExtension: string, viewClass: new (leaf: WorkspaceLeaf, plugin: FileViewerPlugin) => ConvertibleFileView): void {
    try {
      const registry: EmbedRegistry | undefined = (this.app as unknown).embedRegistry
      if (!registry || typeof registry.registerExtension !== "function") return

      registry.unregisterExtension(fileExtension)
      registry.registerExtension(fileExtension, (info: unknown, file: TFile, subpath: string) =>
        new FileViewerEmbedComponent(this, viewClass, info, file, subpath)
      )
      this.embedExtensions.push(fileExtension)
    } catch (e) {
      console.warn(`[file-viewer] embed registration failed for .${fileExtension} (internal API may have changed):`, e)
    }
  }

  onunload(): void {
    // Best-effort cleanup of internal embed registrations.
    const registry: EmbedRegistry | undefined = (this.app as unknown).embedRegistry
    if (registry && typeof registry.unregisterExtension === "function") {
      for (const ext of this.embedExtensions) {
        try { registry.unregisterExtension(ext) } catch { /* ignore */ }
      }
    }
    this.embedExtensions = []
  }
}
