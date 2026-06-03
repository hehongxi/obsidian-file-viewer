import ConvertibleFileView from "src/core/convertible-file-view"
import FileViewerPlugin from "src/main"
import { TFile } from "obsidian"

/**
 * ZIP File View
 * 
 * Preview: Lists ZIP contents (filenames, sizes, compression ratio) 
 *          by parsing the ZIP central directory in pure JS.
 * Convert: Returns a structured list of ZIP contents as Markdown.
 * 
 * Pure JS implementation — no external libraries needed.
 * Only reads the central directory (end of file), not individual entries.
 */

interface ZipEntry {
  name: string
  compressedSize: number
  uncompressedSize: number
  isDirectory: boolean
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B"
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB"
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB"
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB"
}

/**
 * Parse ZIP central directory to get file listing.
 * Reads from the end of the file (EOCD record → central directory).
 */
function parseZipEntries(buffer: ArrayBuffer): ZipEntry[] {
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  const entries: ZipEntry[] = []

  // Find End of Central Directory record (EOCD)
  // Signature: 0x06054b50, located in last 65557 bytes
  let eocdOffset = -1
  const searchStart = Math.max(0, bytes.length - 65557)
  for (let i = bytes.length - 22; i >= searchStart; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i
      break
    }
  }

  if (eocdOffset < 0) return entries // Not a valid ZIP

  // Read EOCD fields
  const centralDirOffset = view.getUint32(eocdOffset + 16, true)
  const totalEntries = view.getUint16(eocdOffset + 10, true)

  // Parse central directory entries
  let offset = centralDirOffset
  for (let i = 0; i < totalEntries; i++) {
    if (offset + 46 > bytes.length) break
    if (view.getUint32(offset, true) !== 0x02014b50) break // Central dir signature

    const compressedSize = view.getUint32(offset + 20, true)
    const uncompressedSize = view.getUint32(offset + 24, true)
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)

    // Read filename
    const nameBytes = bytes.slice(offset + 46, offset + 46 + nameLength)
    const name = new TextDecoder().decode(nameBytes)

    entries.push({
      name,
      compressedSize,
      uncompressedSize,
      isDirectory: name.endsWith("/"),
    })

    offset += 46 + nameLength + extraLength + commentLength
  }

  return entries
}

/**
 * Build a tree structure from flat ZIP entry list.
 */
interface TreeNode {
  name: string
  children?: TreeNode[]
  entry?: ZipEntry
}

function buildTree(entries: ZipEntry[]): TreeNode {
  const root: TreeNode = { name: "", children: [] }

  for (const entry of entries) {
    const parts = entry.name.split("/").filter(p => p)
    let current = root

    for (let i = 0; i < parts.length; i++) {
      if (!current.children) current.children = []

      let child = current.children.find(c => c.name === parts[i])
      if (!child) {
        child = { name: parts[i] }
        current.children.push(child)
      }

      if (i === parts.length - 1) {
        child.entry = entry
      }
      current = child
    }
  }

  return root
}

function renderTreeNode(node: TreeNode, container: HTMLElement, depth: number = 0) {
  const indent = "  ".repeat(depth)

  if (node.entry && !node.entry.isDirectory) {
    const fileDiv = container.createEl("div", { cls: "fv-zip-file" })
    fileDiv.createEl("span", { text: `${indent}📄 ${node.name}` })
    fileDiv.createEl("span", { text: ` ${formatSize(node.entry.uncompressedSize)}`, cls: "fv-zip-size" })
  } else {
    if (node.name) {
      const dirDiv = container.createEl("div", { cls: "fv-zip-folder" })
      dirDiv.createEl("span", { text: `${indent}📁 ${node.name}/` })
    }
    if (node.children) {
      // Sort: directories first, then files
      const sorted = [...node.children].sort((a, b) => {
        const aIsDir = !!a.children
        const bIsDir = !!b.children
        if (aIsDir && !bIsDir) return -1
        if (!aIsDir && bIsDir) return 1
        return a.name.localeCompare(b.name)
      })
      for (const child of sorted) {
        renderTreeNode(child, container, node.name ? depth + 1 : depth)
      }
    }
  }
}

export default class ZipFileView extends ConvertibleFileView {
  static readonly VIEW_TYPE_ID = "zip-view"

  getViewType(): string {
    return ZipFileView.VIEW_TYPE_ID
  }

  static async getFilePreview(plugin: FileViewerPlugin, file: TFile | null): Promise<HTMLElement | null> {
    if (!file) return null

    let buffer: ArrayBuffer
    try {
      buffer = await plugin.app.vault.readBinary(file)
    } catch (e) {
      console.error("Failed to read ZIP file", file.path, e)
      const wrapper = document.createElement("div")
      wrapper.addClass("fv-zip-wrapper")
      wrapper.createEl("p", { text: `(Error reading file: ${file.basename})`, cls: "fv-error-message" })
      return wrapper
    }
    const entries = parseZipEntries(buffer)

    const wrapper = document.createElement("div")
    wrapper.addClass("fv-zip-wrapper")

    // Header info
    const totalFiles = entries.filter(e => !e.isDirectory).length
    const totalDirs = entries.filter(e => e.isDirectory).length
    const totalSize = entries.reduce((sum, e) => sum + e.uncompressedSize, 0)
    const compressedSize = entries.reduce((sum, e) => sum + e.compressedSize, 0)
    const ratio = totalSize > 0 ? ((1 - compressedSize / totalSize) * 100).toFixed(0) : "0"

    const header = wrapper.createEl("div", { cls: "fv-zip-header" })
    header.createEl("span", { text: `${totalFiles} files, ${totalDirs} folders · ${formatSize(totalSize)} → ${formatSize(compressedSize)} (${ratio}% compressed)` })

    // File tree
    if (entries.length === 0) {
      wrapper.createEl("p", { text: "(Empty or invalid zip)" })
    } else {
      const tree = buildTree(entries)
      const treeDiv = wrapper.createEl("div", { cls: "fv-zip-tree" })
      renderTreeNode(tree, treeDiv)
    }

    return wrapper
  }

  async getFilePreview(): Promise<HTMLElement | null> {
    return ZipFileView.getFilePreview(this.plugin, this.file)
  }

  async getMarkdownContent(attachmentsDirectory: string): Promise<string | null> {
    if (!this.file) return null

    let buffer: ArrayBuffer
    try {
      buffer = await this.app.vault.readBinary(this.file)
    } catch (e) {
      console.error("Failed to read ZIP file", this.file.path, e)
      return `(Error reading file: ${this.file.basename})`
    }
    const entries = parseZipEntries(buffer)

    const lines: string[] = []
    lines.push(`## ZIP Contents: ${this.file.basename}`)
    lines.push("")

    const totalFiles = entries.filter(e => !e.isDirectory).length
    const totalSize = entries.reduce((sum, e) => sum + e.uncompressedSize, 0)
    lines.push(`${totalFiles} files · ${formatSize(totalSize)}`)
    lines.push("")

    // Table header
    lines.push("| Type | Name | Size |")
    lines.push("|------|------|------|")

    for (const entry of entries) {
      if (entry.isDirectory) {
        lines.push(`| 📁 | ${entry.name} | - |`)
      } else {
        lines.push(`| 📄 | ${entry.name} | ${formatSize(entry.uncompressedSize)} |`)
      }
    }

    return lines.join("\n")
  }
}