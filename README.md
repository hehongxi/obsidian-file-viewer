<h3 align="center">
    📄 File Viewer for <a href="https://obsidian.md">Obsidian.md</a>
</h3>

<p align="center">
    <a href="./LICENSE"><img src="https://img.shields.io/static/v1.svg?style=for-the-badge&label=License&message=GPL-3.0&colorA=363a4f&colorB=b7bdf8" alt="GPL-3.0 license"/></a>
    <br/><br/>
    <b>Preview and convert</b> multiple file formats (DOCX, XLSX, PDF, EPUB, CSV, and more) to Markdown — all within Obsidian.
</p>

---

## Acknowledgments

This project is **based on [obsidian-docxer](https://github.com/Developer-Mike/obsidian-docxer)** by [Developer-Mike](https://github.com/Developer-Mike). The original plugin provides DOCX preview and conversion; this project extends its architecture to support additional file formats.

The core design pattern — `ConvertibleFileView` abstract base class + `FILETYPE_MAP` registry — is from obsidian-docxer. We gratefully acknowledge the original author's work.

## Overview

File Viewer extends the obsidian-docxer architecture to support previewing and converting multiple document formats:

| Format | Extension | Preview | Convert to MD | Phase |
|--------|-----------|---------|---------------|-------|
| Word | .docx | ✅ docx-preview | ✅ mammoth + turndown | ✅ Done (from docxer) |
| Excel | .xlsx | 🔲 SheetJS | 🔲 SheetJS → table | Phase 2 |
| PDF | .pdf | 🔲 iframe | 🔲 pdf.js | Phase 2 |
| EPUB | .epub | 🔲 epub.js | 🔲 ebooklib | Phase 2 |
| CSV | .csv | 🔲 HTML table | 🔲 native JS | Phase 1 |
| HTML | .html/.htm | 🔲 sandbox iframe | 🔲 DOM → MD | Phase 1 |
| Text | .txt/.json | 🔲 code block | 🔲 native | Phase 1 |
| Jupyter | .ipynb | 🔲 cell render | 🔲 JSON parse | Phase 1 |
| Image | .jpg/.png | 🔲 img tag | 🔲 base64 embed | Phase 1 |
| Audio | .wav/.mp3 | 🔲 audio player | 🔲 metadata | Phase 1 |
| ZIP | .zip | 🔲 file list | 🔲 JSZip | Phase 1 |
| PowerPoint | .pptx | 🔲 TBD | 🔲 markitdown | Phase 3 |

## Installation

### From Community Plugins (coming soon)
Search for "File Viewer" in Settings → Community plugins.

### Manual Installation
1. Create a folder named `file-viewer` in your vault's plugins folder (`<vault>/.obsidian/plugins/`).
2. Download `main.js`, `styles.css` and `manifest.json` from the latest release.
3. Enable the plugin in Settings → Community plugins → Installed plugins.

### BRAT
Install using [BRAT](https://github.com/TfTHacker/obsidian42-brat) by adding `hehongxi/obsidian-file-viewer`.

## Development

```bash
npm install
npm run dev    # watch mode
npm run build  # production build
```

### Adding a New Format

1. Create `src/convertable-file-views/your-format.ts`
2. Extend `ConvertibleFileView`, implement `getFilePreview()` and `getMarkdownContent()`
3. Define `VIEW_TYPE_ID` (e.g. `"your-format-view"`)
4. Register in `src/main.ts` FILETYPE_MAP: `"ext": YourFormatFileView`
5. Implement static `getFilePreview(plugin, file)` for embed support

## Architecture

```
ConvertibleFileView (abstract base class)
  ├── getFilePreview() → render preview
  ├── getMarkdownContent() → convert to MD
  └── convertFile() → trigger conversion

FILETYPE_MAP = { "docx": DocxFileView, ... }  ← register new formats here
```

## License

GPL-3.0 — same as the original obsidian-docxer project.

## Contributing

All contributions welcome! Please fork, branch, and submit a PR.
