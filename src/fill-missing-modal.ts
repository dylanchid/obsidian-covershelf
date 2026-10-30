import { App, Modal, Notice } from 'obsidian';
import { searchGoogleBooks, searchOpenLibrary, downloadCoverImage } from './api';
import { applyNewCover } from './note-writer';
import { BookInfo, CoverResult, CovershelfSettings } from './types';

interface FillEntry {
  book: BookInfo;
  status: 'pending' | 'searching' | 'found' | 'not-found' | 'skipped' | 'applied' | 'error';
  result: CoverResult | null;
  rowEl: HTMLElement;
  previewEl: HTMLElement;
  statusEl: HTMLElement;
  skipBtn: HTMLButtonElement;
}

export class FillMissingModal extends Modal {
  private books: BookInfo[];
  private settings: CovershelfSettings;
  private onComplete: () => void;
  private entries: FillEntry[] = [];

  constructor(
    app: App,
    books: BookInfo[],
    settings: CovershelfSettings,
    onComplete: () => void
  ) {
    super(app);
    this.books = books;
    this.settings = settings;
    this.onComplete = onComplete;
  }

  onOpen() {
    const { contentEl, modalEl } = this;
    modalEl.addClass('covershelf-fill-modal');
    contentEl.empty();

    const header = contentEl.createDiv('covershelf-fill-header');
    header.createEl('h2', { text: `Fill Missing Covers` });
    header.createEl('p', {
      text: `${this.books.length} book${this.books.length !== 1 ? 's' : ''} with no cover — searching Google Books, then Open Library.`,
      cls: 'covershelf-fill-subtitle',
    });

    const list = contentEl.createDiv('covershelf-fill-list');

    for (const book of this.books) {
      const row = list.createDiv('covershelf-fill-row');

      const info = row.createDiv('covershelf-fill-info');
      info.createEl('div', { text: book.title, cls: 'covershelf-fill-title' });
      info.createEl('div', {
        text: book.author || 'Unknown author',
        cls: 'covershelf-fill-author',
      });

      const previewEl = row.createDiv('covershelf-fill-preview');
      const statusEl = row.createEl('span', {
        text: 'Pending…',
        cls: 'covershelf-fill-status',
      });

      const skipBtn = row.createEl('button', { text: 'Skip', cls: 'covershelf-skip-btn' });

      const entry: FillEntry = {
        book,
        status: 'pending',
        result: null,
        rowEl: row,
        previewEl,
        statusEl,
        skipBtn,
      };

      skipBtn.addEventListener('click', () => {
        entry.status = 'skipped';
        statusEl.textContent = 'Skipped';
        statusEl.className = 'covershelf-fill-status is-skipped';
        skipBtn.disabled = true;
      });

      this.entries.push(entry);
    }

    const footer = contentEl.createDiv('covershelf-fill-footer');
    const applyAllBtn = footer.createEl('button', {
      text: 'Apply All Found',
      cls: 'mod-cta covershelf-apply-all-btn',
    });
    applyAllBtn.disabled = true;

    applyAllBtn.addEventListener('click', () => this.applyAll(applyAllBtn));

    // Kick off searches
    this.runSearches(applyAllBtn);
  }

  private async runSearches(applyAllBtn: HTMLButtonElement) {
    // Run searches sequentially with a small delay to be polite to Google's API
    for (const entry of this.entries) {
      if (entry.status === 'skipped') continue;

      entry.status = 'searching';
      entry.statusEl.textContent = 'Searching…';
      entry.statusEl.className = 'covershelf-fill-status is-searching';

      const gbSearch = await searchGoogleBooks(
        entry.book.title,
        entry.book.author,
        entry.book.isbn
      );
      let results = gbSearch.results;
      if (results.length === 0) {
        const olSearch = await searchOpenLibrary(
          entry.book.title,
          entry.book.author,
          entry.book.isbn
        );
        results = olSearch.results;
      }

      if ((entry.status as string) === 'skipped') continue; // user skipped while searching

      if (results.length > 0) {
        entry.result = results[0];
        entry.status = 'found';
        entry.statusEl.textContent = 'Found';
        entry.statusEl.className = 'covershelf-fill-status is-found';

        // Show preview thumbnail
        const img = entry.previewEl.createEl('img', { cls: 'covershelf-fill-thumb' });
        img.src = results[0].displayUrl;
        img.alt = 'Proposed cover';
      } else {
        entry.status = 'not-found';
        entry.statusEl.textContent = 'Not found';
        entry.statusEl.className = 'covershelf-fill-status is-not-found';
      }

      await delay(200);
    }

    // Enable apply button if anything was found
    const foundCount = this.entries.filter((e) => e.status === 'found').length;
    if (foundCount > 0) {
      applyAllBtn.textContent = `Apply ${foundCount} Cover${foundCount !== 1 ? 's' : ''}`;
      applyAllBtn.disabled = false;
    } else {
      applyAllBtn.textContent = 'Nothing to apply';
    }
  }

  private async applyAll(applyAllBtn: HTMLButtonElement) {
    applyAllBtn.disabled = true;
    applyAllBtn.textContent = 'Applying…';

    let applied = 0;
    let failed = 0;

    for (const entry of this.entries) {
      if (entry.status !== 'found' || !entry.result) continue;

      try {
        const data = await downloadCoverImage(entry.result.downloadUrl);
        await applyNewCover(this.app, entry.book, data, this.settings);
        entry.status = 'applied';
        entry.statusEl.textContent = 'Applied';
        entry.statusEl.className = 'covershelf-fill-status is-applied';
        entry.skipBtn.disabled = true;
        applied++;
      } catch {
        entry.status = 'error';
        entry.statusEl.textContent = 'Error';
        entry.statusEl.className = 'covershelf-fill-status is-error';
        failed++;
      }
    }

    const msg = failed > 0
      ? `Applied ${applied} covers (${failed} failed)`
      : `Applied ${applied} cover${applied !== 1 ? 's' : ''}`;
    new Notice(msg);

    this.onComplete();
    this.close();
  }

  onClose() {
    this.contentEl.empty();
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
