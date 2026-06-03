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

| Format | Extension | Preview | Convert to MD | Status |
|--------|-----------|---------|---------------|--------|
| Word | .docx | ✅ docx-preview | ✅ mammoth + turndown | ✅ Done |
| CSV | .csv | ✅ HTML table | ✅ Markdown table | ✅ Done |
| Text/Code | .txt, .json, .xml, .yaml, .py, .js, .ts, .go, .rs, etc. (40+) | ✅ styled code block | ✅ fenced code block | ✅ Done |
| HTML | .html, .htm | ✅ sandboxed iframe | ✅ htmlToMarkdown | ✅ Done |
| Audio | .mp3, .wav, .ogg, .flac, .m4a, .aac, .wma | ✅ HTML5 player | ✅ embed link | ✅ Done |
| ZIP | .zip | ✅ file tree (pure JS) | ✅ table listing | ✅ Done |
| Jupyter | .ipynb | ✅ cell renderer | ✅ code + outputs | ✅ Done |
| Excel | .xlsx/.xls | ✅ SheetJS HTML table | ✅ SheetJS → MD table | ✅ Done |
| PDF | .pdf | ✅ pdf.js canvas | ✅ pdf.js text layer | ✅ Done |
| EPUB | .epub | ✅ epub.js iframe reader | ✅ epub.js spine → MD | ✅ Done |
| PowerPoint | .pptx | ✅ pptx-browser canvas | ✅ pptx-browser text extraction | ✅ Done |

**Note:** Image formats (.jpg, .png, .gif, .webp, .svg) are intentionally not handled — Obsidian natively supports them via its Chromium-based viewer.

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
npm install --legacy-peer-deps
npm run dev    # watch mode
npm run build  # production build
```

### Adding a New Format

1. Create `src/convertable-file-views/your-format.ts`
2. Extend `ConvertibleFileView`, implement `getFilePreview()` and `getMarkdownContent()`
3. Define `VIEW_TYPE_ID` (e.g. `"your-format-view"`)
4. Register in `src/main.ts` FILETYPE_MAP: `"ext": YourFormatFileView`
5. Implement static `getFilePreview(plugin, file)` for embed support
6. Add styles to `src/styles/preview.scss`
7. Run `npm run build` to verify

## Architecture

```
ConvertibleFileView (abstract base class)
  ├── getFilePreview() → render preview
  ├── getMarkdownContent() → convert to MD
  └── convertFile() → trigger conversion

FILETYPE_MAP = { "docx": DocxFileView, "csv": CsvFileView, ... }  ← register new formats here

src/convertable-file-views/
  ├── docx.ts       (Word - mammoth + docx-preview)
  ├── csv.ts        (CSV - pure JS parser + HTML table)
  ├── text.ts       (40+ text/code extensions - code block)
  ├── html.ts       (HTML - sandboxed iframe + sanitization)
  ├── audio.ts      (Audio - HTML5 player)
  ├── zip.ts        (ZIP - pure JS central directory parser)
  └── jupyter.ts    (Jupyter - JSON cell renderer)
```

### Key Design Decisions

- **No file size gating (yet)** — Phase 1 formats are lightweight. Phase 2 (XLSX, PDF) will need tiered preview.
- **Pure JS only** — Phase 1 uses zero external libraries beyond what obsidian-docxer already bundles. JSZip, SheetJS, pdf.js etc. are Phase 2.
- **Security first** — HTML is rendered in sandboxed iframes (`sandbox="allow-same-origin"`, no scripts). Scripts, iframes, forms, and event handlers are stripped.
- **No override of Obsidian built-ins** — Image and video formats are not registered because Obsidian handles them well natively.

## License

GPL-3.0 — same as the original obsidian-docxer project.

## Contributing

All contributions welcome! Please fork, branch, and submit a PR.
