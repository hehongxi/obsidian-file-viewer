import ConvertibleFileView from "src/core/convertible-file-view"
import FileViewerPlugin from "src/main"
import { Notice, TFile } from "obsidian"

/**
 * EPUB File View
 * 
 * Preview: Embedded epubjs reader in a sandboxed iframe.
 *          - epubjs library is inlined (~224KB minified) into the iframe HTML
 *          - EPUB binary is passed as base64 via the HTML template
 *          - Supports paginated reading with prev/next navigation
 *          - TOC sidebar for chapter navigation
 *          - epubjs renders book content in its own internal iframe for style isolation
 * 
 * Convert: Parses EPUB as ZIP → OPF manifest → spine XHTML → Markdown.
 *           Uses JSZip (lazy-loaded, ~96KB) for decompression + DOMParser for XML/HTML.
 *           Supports EPUB 2 (NCX TOC) and EPUB 3 (nav.xhtml TOC).
 * 
 * Dependency: epubjs (~224KB minified, inlined in iframe for preview only)
 *             JSZip (~96KB, lazy-loaded for conversion)
 */

/** Build the EPUB reader HTML that runs inside the iframe */
function buildReaderHTML(epubBase64: string, epubJsSource: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { height: 100%; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  body { display: flex; flex-direction: column; }

  /* ── Toolbar ── */
  #toolbar {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 12px;
    background: var(--background-secondary, #f0f0f0);
    border-bottom: 1px solid var(--background-modifier-border, #ddd);
    flex-shrink: 0;
    user-select: none;
  }
  #toolbar button {
    padding: 4px 10px; border: 1px solid var(--background-modifier-border, #ccc);
    border-radius: 4px; background: var(--background-primary, #fff);
    cursor: pointer; font-size: 14px;
    color: var(--text-normal, #333);
  }
  #toolbar button:hover { background: var(--background-modifier-hover, #e8e8e8); }
  #toolbar button:active { background: var(--background-modifier-active, #ddd); }
  #toolbar button:disabled { opacity: 0.4; cursor: default; }
  #location { font-size: 12px; color: var(--text-muted, #888); margin: 0 8px; white-space: nowrap; }
  #toolbar-spacer { flex: 1; }
  #toc-toggle { font-weight: bold; }

  /* ── Main area ── */
  #main { display: flex; flex: 1; overflow: hidden; }

  /* ── TOC sidebar ── */
  #toc-sidebar {
    width: 240px; flex-shrink: 0;
    border-right: 1px solid var(--background-modifier-border, #ddd);
    background: var(--background-secondary, #f8f8f8);
    overflow-y: auto; padding: 8px 0;
    display: none;
  }
  #toc-sidebar.open { display: block; }
  #toc-sidebar .toc-item {
    display: block; padding: 6px 16px; font-size: 13px;
    color: var(--text-normal, #333); cursor: pointer;
    text-decoration: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    border-left: 3px solid transparent;
  }
  #toc-sidebar .toc-item:hover { background: var(--background-modifier-hover, #e8e8e8); }
  #toc-sidebar .toc-item.active {
    background: var(--background-modifier-active, #ddd);
    border-left-color: var(--interactive-accent, #448aff);
    font-weight: 600;
  }

  /* ── Viewer area ── */
  #viewer {
    flex: 1; overflow: hidden;
    background: var(--background-primary, #fff);
  }
  #viewer iframe { border: none; }

  /* ── Loading ── */
  #loading {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    font-size: 14px; color: var(--text-muted, #888);
  }

  /* ── Dark mode support ── */
  @media (prefers-color-scheme: dark) {
    body { background: #1e1e1e; }
  }
</style>
</head>
<body>
<div id="toolbar">
  <button id="btn-prev" title="Previous page">◀</button>
  <span id="location">Loading...</span>
  <button id="btn-next" title="Next page">▶</button>
  <span id="toolbar-spacer"></span>
  <button id="toc-toggle" title="Table of Contents">☰</button>
</div>
<div id="main">
  <nav id="toc-sidebar"></nav>
  <div id="viewer"><div id="loading">Loading EPUB...</div></div>
</div>
<script>
// ── epubjs library (inlined, ~224KB) ──
${epubJsSource}

// ── Base64 → ArrayBuffer ──
function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// ── epubjs is loaded via the inlined script above ──
var book = ePub(base64ToArrayBuffer("${epubBase64}"));
var rendition = book.renderTo("viewer", {
  width: "100%", height: "100%",
  flow: "paginated",
  spread: "none",
  manager: "default"
});

var loading = document.getElementById("loading");
var locationEl = document.getElementById("location");
var prevBtn = document.getElementById("btn-prev");
var nextBtn = document.getElementById("btn-next");
var tocSidebar = document.getElementById("toc-sidebar");
var tocToggle = document.getElementById("toc-toggle");

// ── TOC toggle ──
tocToggle.addEventListener("click", function() {
  tocSidebar.classList.toggle("open");
});

// ── Navigation ──
prevBtn.addEventListener("click", function() { rendition.prev(); });
nextBtn.addEventListener("click", function() { rendition.next(); });

// Keyboard navigation
document.addEventListener("keydown", function(e) {
  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
    e.preventDefault();
    if (e.key === "ArrowLeft") rendition.prev();
    else rendition.next();
  }
});

// ── Location tracking ──
rendition.on("relocated", function(location) {
  if (loading) { loading.remove(); loading = null; }
  var loc = location.start;
  locationEl.textContent = (loc.displayed.page || 1) + " / " + (loc.displayed.total || "?");
  prevBtn.disabled = location.atStart;
  nextBtn.disabled = location.atEnd;

  // Highlight active TOC item
  var items = tocSidebar.querySelectorAll(".toc-item");
  items.forEach(function(item) { item.classList.remove("active"); });
  var href = location.start.href;
  if (href) {
    var active = tocSidebar.querySelector('.toc-item[data-href="' + href + '"]');
    if (active) active.classList.add("active");
  }
});

// ── Build TOC from book navigation ──
book.loaded.navigation.then(function(nav) {
  if (!nav || !nav.toc) return;
  function renderToc(items, container, depth) {
    depth = depth || 0;
    items.forEach(function(item) {
      var el = document.createElement("a");
      el.className = "toc-item";
      el.textContent = item.label;
      el.setAttribute("data-href", item.href);
      el.style.paddingLeft = (16 + depth * 16) + "px";
      el.addEventListener("click", function(e) {
        e.preventDefault();
        rendition.display(item.href);
        // On mobile, close sidebar after selection
        if (window.innerWidth < 600) tocSidebar.classList.remove("open");
      });
      container.appendChild(el);
      if (item.subitems) renderToc(item.subitems, container, depth + 1);
    });
  }
  renderToc(nav.toc, tocSidebar);
  // If book title in nav, update document title
  if (nav.toc[0] && nav.toc[0].label) {
    document.title = nav.toc[0].label;
  }
});

// ── Handle resize ──
window.addEventListener("resize", function() {
  // epubjs handles resize internally
});

// ── Initial render ──
rendition.display();
</script>
</body>
</html>`
}

export default class EpubFileView extends ConvertibleFileView {
  static readonly VIEW_TYPE_ID = "epub-view"

  getViewType(): string {
    return EpubFileView.VIEW_TYPE_ID
  }

  /**
   * Static helper: get preview element for embed support.
   */
  static async getFilePreview(plugin: FileViewerPlugin, file: TFile | null): Promise<HTMLElement | null> {
    if (!file) return null

    const wrapper = document.createElement("div")
    wrapper.addClass("fv-epub-wrapper")

    let fileBuffer: ArrayBuffer
    try {
      fileBuffer = await plugin.app.vault.readBinary(file)
    } catch (e) {
      console.error("Failed to read EPUB file", file.path, e)
      wrapper.createEl("p", {
        text: `(Error reading file: ${file.basename})`,
        cls: "fv-error-message"
      })
      return wrapper
    }

    // Convert ArrayBuffer → base64 for embedding in iframe HTML
    const base64 = EpubFileView.arrayBufferToBase64(fileBuffer)

    // Dynamically import epubjs source (lazy-loaded, ~224KB)
    const { default: epubJsSource } = await import("virtual:epubjs-source")

    // Build reader HTML with epubjs + EPUB data
    const html = buildReaderHTML(base64, epubJsSource)

    // Create blob URL for the iframe
    const blob = new Blob([html], { type: 'text/html' })
    const blobUrl = URL.createObjectURL(blob)

    const iframe = document.createElement("iframe")
    iframe.addClass("fv-epub-iframe")
    iframe.setAttribute("sandbox", "allow-same-origin allow-scripts")
    iframe.setAttribute("title", `EPUB Preview: ${file.basename}`)
    iframe.setAttribute("loading", "lazy")
    iframe.src = blobUrl

    // Clean up blob URL when iframe is removed
    iframe.addEventListener("load", () => {
      // Blob URL can be revoked after iframe loads — the content is in memory
      URL.revokeObjectURL(blobUrl)
    })

    wrapper.appendChild(iframe)
    return wrapper
  }

  async getFilePreview(): Promise<HTMLElement | null> {
    return EpubFileView.getFilePreview(this.plugin, this.file)
  }

  /**
   * Convert EPUB to Markdown.
   * Parses EPUB as ZIP → extracts OPF → reads spine HTML files → Markdown.
   * Uses JSZip for decompression (lazy-loaded, ~96KB) + DOMParser for XML/HTML parsing.
   */
  async getMarkdownContent(_attachmentsDirectory: string): Promise<string | null> {
    if (!this.file) return null

    let fileBuffer: ArrayBuffer
    try {
      fileBuffer = await this.app.vault.readBinary(this.file)
    } catch (e) {
      console.error("Failed to read EPUB file for conversion", this.file.path, e)
      return `(Error reading file: ${this.file.basename})`
    }

    // Dynamic import: JSZip loaded only when converting
    const JSZip = (await import('jszip')).default
    let zip: unknown
    try {
      zip = await JSZip.loadAsync(fileBuffer)
    } catch (e) {
      console.error("[epub-view] Failed to open EPUB as ZIP", e)
      return `(Error: could not parse EPUB file — may be corrupted or DRM-protected.)`
    }

    // Step 1: Parse container.xml → find OPF path
    const containerFile = zip.file("META-INF/container.xml")
    if (!containerFile) return `(Error: not a valid EPUB — missing container.xml)`

    const containerXml = await containerFile.async("text")
    const containerDoc = new DOMParser().parseFromString(containerXml, "text/xml")
    const rootfileEl = containerDoc.querySelector("rootfile")
    const opfPath = rootfileEl?.getAttribute("full-path") || ""
    if (!opfPath) return `(Error: could not find OPF path in container.xml)`

    // Step 2: Parse OPF → metadata + spine
    const opfDir = opfPath.substring(0, opfPath.lastIndexOf('/') + 1)
    const opfFile = zip.file(opfPath)
    if (!opfFile) return `(Error: OPF file not found: ${opfPath})`

    const opfXml = await opfFile.async("text")
    const opfDoc = new DOMParser().parseFromString(opfXml, "text/xml")

    // Extract title
    const titleEl = opfDoc.querySelector("metadata > dc\\:title, metadata > title")
    const title = titleEl?.textContent?.trim() || this.file.basename

    // Build manifest lookup: id → href
    const manifest: Map<string, string> = new Map()
    for (const item of opfDoc.querySelectorAll("manifest > item")) {
      const id = item.getAttribute("id")
      const href = item.getAttribute("href")
      if (id && href) manifest.set(id, href)
    }

    // Get spine (ordered reading list)
    const spineItems: Array<{ idref: string; href: string }> = []
    for (const itemref of opfDoc.querySelectorAll("spine > itemref")) {
      const idref = itemref.getAttribute("idref") || ""
      const href = manifest.get(idref) || ""
      if (href) spineItems.push({ idref, href })
    }

    // Step 3: Parse TOC (NCX or nav) for chapter labels
    const tocLabels = await EpubFileView.parseEPUBTOC(zip, opfDoc, opfDir)

    // Step 4: Extract text from each spine item
    let markdown = `# ${title}\n\n`

    // Build TOC section
    if (tocLabels.length > 0) {
      markdown += `## 目录\n\n`
      for (const entry of tocLabels) {
        markdown += `- ${entry.label}\n`
      }
      markdown += `\n---\n\n`
    }

    let chapterIndex = 0
    for (const item of spineItems) {
      const contentHref = opfDir + item.href
      const contentFile = zip.file(contentHref)
      if (!contentFile) {
        console.warn(`[epub-view] Spine item not found: ${contentHref}`)
        continue
      }

      try {
        const htmlText = await contentFile.async("text")
        const htmlDoc = new DOMParser().parseFromString(htmlText, "text/html")
        const body = htmlDoc.body
        if (!body) continue

        const text = (body.textContent || "").trim()
        if (!text) continue

        chapterIndex++

        // Match TOC label by href
        const tocLabel = tocLabels.find(t => t.href && contentHref.endsWith(t.href) || item.href === t.href)
        const chapterTitle = tocLabel?.label || `Chapter ${chapterIndex}`

        markdown += `## ${chapterTitle}\n\n${text}\n\n`

      } catch (e) {
        console.warn(`[epub-view] Failed to extract section: ${contentHref}`, e)
      }
    }

    if (chapterIndex === 0) {
      return `# ${title}\n\n*(No text content could be extracted from this EPUB.)*\n`
    }

    new Notice(`EPUB converted: ${chapterIndex} chapters extracted`)
    return markdown.trim()
  }

  /**
   * Parse EPUB TOC from NCX file or nav.xhtml.
   * Returns array of {label, href} for chapter matching.
   */
  private static async parseEPUBTOC(
    zip: unknown,
    opfDoc: Document,
    opfDir: string
  ): Promise<Array<{ label: string; href: string }>> {
    const entries: Array<{ label: string; href: string }> = []

    // Try NCX (EPUB 2 style)
    const spineEl = opfDoc.querySelector("spine")
    const ncxId = spineEl?.getAttribute("toc") || ""
    let ncxHref = ""
    if (ncxId) {
      const ncxItem = opfDoc.querySelector(`manifest > item[id="${ncxId}"]`)
      ncxHref = ncxItem?.getAttribute("href") || ""
    } else {
      // Search manifest for NCX media-type
      const ncxItem = opfDoc.querySelector('manifest > item[media-type="application/x-dtbncx+xml"]')
      ncxHref = ncxItem?.getAttribute("href") || ""
    }

    if (ncxHref) {
      const ncxFile = zip.file(opfDir + ncxHref)
      if (ncxFile) {
        try {
          const ncxXml = await ncxFile.async("text")
          const ncxDoc = new DOMParser().parseFromString(ncxXml, "text/xml")
          const navPoints = ncxDoc.querySelectorAll("navPoint")
          for (const np of navPoints) {
            const label = np.querySelector("navLabel > text")?.textContent?.trim()
            const content = np.querySelector("content")
            const src = content?.getAttribute("src") || ""
            if (label) entries.push({ label, href: src })
          }
        } catch { /* NCX parse failure — non-fatal */ }
      }
    }

    // If no NCX TOC, try nav.xhtml (EPUB 3 style) — fallback
    if (entries.length === 0) {
      const navItem = opfDoc.querySelector('manifest > item[properties="nav"], manifest > item[media-type="application/xhtml+xml"][id="nav"]')
      const navHref = navItem?.getAttribute("href") || ""
      if (navHref) {
        const navFile = zip.file(opfDir + navHref)
        if (navFile) {
          try {
            const navHtml = await navFile.async("text")
            const navDoc = new DOMParser().parseFromString(navHtml, "text/html")
            const links = navDoc.querySelectorAll('nav[epub\\:type="toc"] a, nav#toc a, nav.toc a')
            for (const link of links) {
              const label = (link as HTMLElement).textContent?.trim()
              const href = (link as HTMLAnchorElement).getAttribute("href") || ""
              if (label) entries.push({ label, href })
            }
          } catch { /* nav parse failure — non-fatal */ }
        }
      }
    }

    return entries
  }

  /** Convert ArrayBuffer to base64 string */
  private static arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }
}