# rebeccaliu site

Plain HTML site, no build step. Everything the visitor sees is in `site/`.

## Edit it (like Carrd)

```
python3 serve.py
```

Open http://localhost:8765, click **Edit** (bottom right), click on any text and type.

- **⌘K** add / change / remove a link on selected text
- **⌘B** / **⌘I** bold / italic
- **Enter** new line in a paragraph, new bullet in a list
- **click a block to select it**: it gets **↑ ↓ ✕** on its side (move / delete) and a layout panel
  appears above the toolbar:
  - **Align** ⇤ ≡ ⇥ left / center / right (any block, including the photo)
  - **Wrap text** ◧ none ◨ (images and photo rows): floats the picture left or right so the
    text after it flows around it; the blocks that follow wrap until they run past the picture
  - **Size** − + : picture width (images) or text size (text blocks), in small steps
  - **Start below any wrapped image**: forces the selected block to begin under a wrapped picture
- **+ Add block…** heading, paragraph, bullet list, link row, image
- click the photo to replace it
- **+ Add block… → Photo row** adds a row of small thumbnails (click one to replace it, **+ photo**
  in the panel to add another, **Size** to change them, **⌥-click** a thumbnail to remove it);
  visitors click a thumbnail to open the full-size picture
- to link text to an album instead (Google Photos etc.): select the words, **⌘K**, paste the URL
- **Save** (or ⌘S) writes `site/index.html`; the previous version is kept in `.backups/`

The editor only exists on your computer. The published site is just the files in `site/`.

## Pages

- `site/index.html` — the main page
- `site/haiti.html` — photo page linked from "performed surgeries"
- `site/aaase.html` — photo page linked from "won 2nd place in the Princeton AAASE"

Edit any page the same way: open it at http://localhost:8765/<page>.html, Edit, Save.

## Publish

Upload the `site/` folder to any static host (GitHub Pages, Netlify, Vercel, Cloudflare Pages).
