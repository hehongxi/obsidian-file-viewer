import ConvertibleFileView from "src/core/convertible-file-view"
import DocxerPlugin from "src/main"
import { TFile } from "obsidian"

/**
 * Audio File View
 * 
 * Preview: Renders an HTML5 audio player with file info.
 * Convert: Creates a Markdown embed link `![[filename.ext]]`.
 * 
 * Handles: .mp3, .wav, .ogg, .flac, .m4a, .aac, .wma
 * Pure JS implementation — no external libraries needed.
 */

const AUDIO_EXTENSIONS = ["mp3", "wav", "ogg", "flac", "m4a", "aac", "wma"]

/** MIME type mapping for audio formats */
const AUDIO_MIME: { [key: string]: string } = {
  "mp3": "audio/mpeg",
  "wav": "audio/wav",
  "ogg": "audio/ogg",
  "flac": "audio/flac",
  "m4a": "audio/mp4",
  "aac": "audio/aac",
  "wma": "audio/x-ms-wma",
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B"
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB"
  return (bytes / (1024 * 1024)).toFixed(1) + " MB"
}

export { AUDIO_EXTENSIONS }

export default class AudioFileView extends ConvertibleFileView {
  static readonly VIEW_TYPE_ID = "audio-view"

  getViewType(): string {
    return AudioFileView.VIEW_TYPE_ID
  }

  static async getFilePreview(plugin: DocxerPlugin, file: TFile | null): Promise<HTMLElement | null> {
    if (!file) return null

    const wrapper = document.createElement("div")
    wrapper.addClass("fv-audio-wrapper")

    // Audio icon
    const icon = wrapper.createEl("div", { cls: "fv-audio-icon" })
    icon.textContent = "🎵"

    // File name
    const title = wrapper.createEl("div", { cls: "fv-audio-title" })
    title.textContent = file.basename

    // Audio player
    const audio = document.createElement("audio")
    audio.addClass("fv-audio-player")
    audio.setAttribute("controls", "controls")
    audio.setAttribute("preload", "metadata")

    // Use vault resource path to load the audio
    const resourcePath = plugin.app.vault.getResourcePath(file)
    const source = document.createElement("source")
    source.src = resourcePath
    source.type = AUDIO_MIME[file.extension.toLowerCase()] || "audio/mpeg"
    audio.appendChild(source)

    wrapper.appendChild(audio)

    // File info
    const info = wrapper.createEl("div", { cls: "fv-audio-info" })
    const ext = file.extension.toUpperCase()
    info.createEl("span", { text: `${ext} · ${formatFileSize(file.stat.size)}` })

    return wrapper
  }

  async getFilePreview(): Promise<HTMLElement | null> {
    return AudioFileView.getFilePreview(this.plugin, this.file)
  }

  async getMarkdownContent(attachmentsDirectory: string): Promise<string | null> {
    if (!this.file) return null
    // Return Obsidian wiki-link embed for audio
    return `![[${this.file.name}]]`
  }
}
