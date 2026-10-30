import { App, TFile } from 'obsidian';
import { BookInfo, CovershelfSettings } from './types';

/**
 * Derives the cover filename from a book note's basename.
 * Mirrors the vault convention exactly: spaces → underscores, everything else preserved.
 *
 * e.g. "Moby-Dick"                          → "Moby-Dick.jpg"
 *      "Blood Meridian"                     → "Blood_Meridian.jpg"
 *      "Batman - The Dark Knight Returns"   → "Batman_-_The_Dark_Knight_Returns.jpg"
 */
export function normalizeCoverFilename(noteBasename: string): string {
  return noteBasename
    .replace(/ /g, '_')
    .replace(/[\/\\]/g, '_')   // strip path separators
    .replace(/\.{2,}/g, '_')   // strip .. traversal sequences
    + '.jpg';
}

/**
 * Reads all book notes from the configured folder.
 * Skips notes with no title AND no author in frontmatter.
 */
export function getBooksInFolder(app: App, settings: CovershelfSettings): BookInfo[] {
  const books: BookInfo[] = [];

  for (const file of app.vault.getFiles()) {
    if (file.extension !== 'md') continue;
    if (file.parent?.path !== settings.booksFolder) continue;

    const cache = app.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter;
    if (!fm) continue;

    const title: string = (fm.title ?? '').replace(/^"|"$/g, '').trim();
    const author: string = (fm.author ?? '').replace(/^"|"$/g, '').trim();
    if (!title && !author) continue;

    // Cover is stored as a wikilink string: "[[Books/covers/X.jpg]]"
    const coverRaw: string = typeof fm.cover === 'string' ? fm.cover : '';
    const currentCoverPath = coverRaw
      .replace(/^"?\[\[/, '')
      .replace(/\]\]"?$/, '')
      .trim() || undefined;

    books.push({
      file,
      title: title || file.basename,
      author,
      isbn: typeof fm.isbn === 'string' ? fm.isbn.replace(/^"|"$/g, '') : undefined,
      currentCoverPath,
    });
  }

  return books.sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * Writes a new cover image to the vault and updates the book note.
 *
 * Uses vault.read() + vault.modify() directly rather than processFrontMatter().
 * processFrontMatter() skips the write when the YAML value is unchanged (same
 * filename = same value = no-op). vault.modify() always writes and always fires
 * the vault change event, which forces Bases card views to re-render and pick up
 * the new image file's updated mtime.
 */
export async function applyNewCover(
  app: App,
  book: BookInfo,
  coverData: ArrayBuffer,
  settings: CovershelfSettings
): Promise<void> {
  const coverFilename = normalizeCoverFilename(book.file.basename);
  const coverPath = `${settings.coversFolder}/${coverFilename}`;

  // 1. Write the image file (overwrite if it already exists)
  let imageFile: TFile;
  const existingCover = app.vault.getAbstractFileByPath(coverPath);
  if (existingCover instanceof TFile) {
    await app.vault.modifyBinary(existingCover, coverData);
    imageFile = existingCover;
  } else {
    if (!app.vault.getAbstractFileByPath(settings.coversFolder)) {
      await app.vault.createFolder(settings.coversFolder);
    }
    imageFile = await app.vault.createBinary(coverPath, coverData);
  }

  // 2. Read the note and update both the cover frontmatter property and the body embed.
  //    vault.modify() always writes regardless of content equality, so the note's
  //    mtime always updates — this is what triggers Bases to re-render the card and
  //    fetch the image at its new mtime-based resource URL.
  let content = await app.vault.read(book.file);

  const newCoverValue = `"[[${coverPath}]]"`;
  const newEmbed = `![[covers/${coverFilename}]]`;

  // Update the frontmatter cover: line — handles empty, quoted wikilink, or missing
  if (/^cover:/m.test(content)) {
    content = content.replace(/^cover:.*$/m, `cover: ${newCoverValue}`);
  } else {
    // Property missing entirely — insert after year: or author: as fallback
    if (/^year:/m.test(content)) {
      content = content.replace(/^(year:.*$)/m, `$1\ncover: ${newCoverValue}`);
    } else {
      content = content.replace(/^(author:.*$)/m, `$1\ncover: ${newCoverValue}`);
    }
  }

  // Update the body embed — match any image embed referencing the covers folder
  const embedPattern = /!\[\[(?:[^\]]*\/)?covers\/[^\]]+\.(?:jpg|jpeg|png|webp)\]\]/i;
  if (embedPattern.test(content)) {
    content = content.replace(embedPattern, newEmbed);
  } else {
    // No embed yet — insert immediately after the closing --- of the frontmatter
    content = content.replace(/^(---\n[\s\S]*?\n---\n)/, `$1${newEmbed}\n`);
  }

  await app.vault.modify(book.file, content);

  // 3. Force immediate visual refresh of every rendered <img> that references
  //    this cover file. Obsidian's note renderer diffs content — since the embed
  //    wikilink text didn't change, the DOM node isn't touched and the browser
  //    keeps the old cached URL. We find those elements and swap in the fresh
  //    resource URL (which includes the image file's updated mtime as a cache key).
  //    A small delay lets Obsidian flush its file-stat cache after the binary write.
  setTimeout(() => {
    const freshSrc = app.vault.getResourcePath(imageFile);
    const workspace = document.querySelector<HTMLElement>('.workspace') ?? document;
    workspace.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
      if (img.src.includes(coverFilename)) {
        img.src = freshSrc;
      }
    });
  }, 80);
}

/**
 * Loads a vault-local image file as a blob object URL for use in img.src.
 * Caller is responsible for calling URL.revokeObjectURL() when done.
 */
export async function loadVaultImageUrl(app: App, vaultPath: string): Promise<string | null> {
  const file = app.vault.getAbstractFileByPath(vaultPath);
  if (!(file instanceof TFile)) return null;
  try {
    const data = await app.vault.readBinary(file);
    const blob = new Blob([data], { type: 'image/jpeg' });
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}
