# CoverShelf

Browse, preview, and swap book covers from Google Books and Open Library — individually or in bulk.

## Use

Set the **Books folder** and **Covers folder** under **Settings → CoverShelf**. Open the cover library from the ribbon or run **Open Cover Library** from the command palette. On a book note, run **Pick cover for this book** or choose **Change book cover** from its file menu. **Fill missing covers** searches for books without a saved cover.

CoverShelf downloads selected images into the configured covers folder and updates the book note. Test it on a sample book note before using bulk actions.

## Network use

Cover searches and image downloads contact Google Books (`www.googleapis.com` and its image hosts) and Open Library (`openlibrary.org` and `covers.openlibrary.org`). Search requests include book title, author, or ISBN from the note. CoverShelf does not require an account.

## Install manually

Run `npm ci && npm run build`, then copy `manifest.json`, `main.js`, and `styles.css` into `<vault>/.obsidian/plugins/covershelf/`. Enable the plugin under **Settings → Community plugins**.

## Develop

Run `npm ci` and `npm run build` from this directory.

## License

MIT. See [LICENSE](LICENSE).
