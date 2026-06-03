import AudioFileView from "./convertable-file-views/audio"
import CsvFileView from "./convertable-file-views/csv"
import DocxFileView from "./convertable-file-views/docx"
import EpubFileView from "./convertable-file-views/epub"
import HtmlFileView from "./convertable-file-views/html"
import ImageFileView from "./convertable-file-views/image"
import JupyterFileView from "./convertable-file-views/jupyter"
import PdfFileView from "./convertable-file-views/pdf"
import TextFileView, { TEXT_EXTENSIONS } from "./convertable-file-views/text"
import XlsxFileView from "./convertable-file-views/xlsx"
import ZipFileView from "./convertable-file-views/zip"
import ConvertibleFileView from "./core/convertible-file-view"
import FileViewerEmbedComponent from "./core/docxer-embed-component"
import SettingsManager from "./settings"
import { Plugin, TFile, WorkspaceLeaf } from "obsidian"

/** Internal embed registry — not part of the public API. */
interface EmbedRegistry {
  unregisterExtension(ext: string): void
  registerExtension(ext: string, factory: (info: unknown, file: TFile, subpath: string) => unknown): void
}

// Based on obsidian-docxer's FILETYPE_MAP pattern
const FILETYPE_MAP: { [key: string]: new(leaf: WorkspaceLeaf, plugin: FileViewerPlugin) => ConvertibleFileView } = {
  "docx": DocxFileView,
  "csv": CsvFileView,
  "html": HtmlFileView,
  "htm": HtmlFileView,
  "mp3": AudioFileView,
  "wav": AudioFileView,
  "ogg": AudioFileView,
  "flac": AudioFileView,
  "m4a": AudioFileView,
  "aac": AudioFileView,
  "wma": AudioFileView,
  "zip": ZipFileView,
  "ipynb": JupyterFileView,
  // Image formats
  "jpg": ImageFileView,
  "jpeg": ImageFileView,
  "png": ImageFileView,
  "gif": ImageFileView,
  "webp": ImageFileView,
  "bmp": ImageFileView,
  "svg": ImageFileView,
  // Excel / Spreadsheets
  "xlsx": XlsxFileView,
  "xls": XlsxFileView,
  "pdf": PdfFileView,
  "epub": EpubFileView,
  // TODO: Phase 3
  // "pptx": PptxFileView,
}

// Extensions already handled by Obsidian or other format views
const SKIP_EXTENSIONS = new Set([
  "md", "csv", "docx", "html", "htm",
  "ico", "avif",
  "mp3", "wav", "ogg", "flac", "m4a", "aac", "wma",
  "mp4", "webm", "ogv", "avi", "mov",
  "xlsx", "xls",
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
