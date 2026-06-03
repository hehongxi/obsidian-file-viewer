import FileViewerPlugin from "src/main"
import ConvertibleFileView from "./convertible-file-view"
import { Component, TFile, WorkspaceLeaf } from "obsidian"

export default class FileViewerEmbedComponent extends Component {
  plugin: FileViewerPlugin
  view: new (leaf: WorkspaceLeaf, plugin: FileViewerPlugin) => ConvertibleFileView

  info: unknown
  file: TFile
  subpath: string

  constructor(plugin: FileViewerPlugin, view: new (leaf: WorkspaceLeaf, plugin: FileViewerPlugin) => ConvertibleFileView, info: unknown, file: TFile, subpath: string) {
    super()

    this.plugin = plugin
    this.view = view

    this.info = info
    this.file = file
    this.subpath = subpath

    info.containerEl.addClass("fv-embed")
  }

  // override
  async loadFile() {
    const preview = await (this.view as unknown).getFilePreview(this.plugin, this.file)
    if (!preview) return

    this.info.containerEl.appendChild(preview)
  }

  static isEmbeddable(view: new (leaf: WorkspaceLeaf, plugin: FileViewerPlugin) => ConvertibleFileView) {
    return (view as unknown).getFilePreview !== undefined
  }
}