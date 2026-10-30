import { App, Modal, Notice } from 'obsidian';
import { getBooksInFolder } from './note-writer';
import { BookInfo, CovershelfSettings } from './types';
import { CoverPickerModal } from './cover-picker-modal';
import { FillMissingModal } from './fill-missing-modal';
import { loadVaultImageUrl } from './note-writer';

export class LibraryOverviewModal extends Modal {
  private settings: CovershelfSettings;
  private books: BookInfo[] = [];
  private objectUrls: string[] = [];

  constructor(app: App, settings: CovershelfSettings) {
    super(app);
    this.settings = settings;
  }

  onOpen() {
    const { contentEl, modalEl } = this;
    modalEl.addClass('covershelf-overview-modal');
    contentEl.empty();

    this.books = getBooksInFolder(this.app, this.settings);

    const missing = this.books.filter((b) => !b.currentCoverPath);

    // Header
    const header = contentEl.createDiv('covershelf-overview-header');
    header.createEl('h2', { text: 'Cover Library' });

    const headerActions = header.createDiv('covershelf-overview-actions');
    headerActions.createEl('span', {
      text: `${this.books.length} books`,
      cls: 'covershelf-overview-count',
    });

    if (missing.length > 0) {
      const fillBtn = headerActions.createEl('button', {
        text: `Fill ${missing.length} Missing`,
        cls: 'covershelf-fill-missing-btn',
      });
      fillBtn.addEventListener('click', () => {
        this.close();
        new FillMissingModal(this.app, missing, this.settings, () => {
          // Reopen overview after fill completes
          new LibraryOverviewModal(this.app, this.settings).open();
        }).open();
      });
    }

    // Cover grid
    const grid = contentEl.createDiv('covershelf-overview-grid');

    for (const book of this.books) {
      this.renderBookItem(grid, book);
    }
  }

  private renderBookItem(grid: HTMLElement, book: BookInfo) {
    const item = grid.createDiv('covershelf-overview-item');
    item.setAttribute('title', `${book.title}${book.author ? ' — ' + book.author : ''}`);

    const imgWrap = item.createDiv('covershelf-overview-img-wrap');
    const img = imgWrap.createEl('img', { cls: 'covershelf-overview-img' });
    img.alt = book.title;

    if (book.currentCoverPath) {
      loadVaultImageUrl(this.app, book.currentCoverPath).then((url) => {
        if (url) {
          this.objectUrls.push(url);
          img.src = url;
        } else {
          imgWrap.addClass('covershelf-no-cover');
          imgWrap.createEl('span', { text: '?', cls: 'covershelf-no-cover-icon' });
        }
      });
    } else {
      imgWrap.addClass('covershelf-no-cover');
      imgWrap.createEl('span', { text: '?', cls: 'covershelf-no-cover-icon' });
    }

    item.createEl('div', {
      text: book.title,
      cls: 'covershelf-overview-title',
    });

    // Click → open picker for this book
    item.addEventListener('click', () => {
      new CoverPickerModal(this.app, book, this.settings, () => {
        // Refresh this item's thumbnail after cover is applied
        this.refreshBookItem(img, imgWrap, book);
      }).open();
    });
  }

  private refreshBookItem(
    img: HTMLImageElement,
    imgWrap: HTMLElement,
    book: BookInfo
  ) {
    // Re-read the book's updated cover path from metadata cache
    const cache = this.app.metadataCache.getFileCache(book.file);
    const fm = cache?.frontmatter;
    if (!fm) return;

    const coverRaw: string = typeof fm.cover === 'string' ? fm.cover : '';
    const coverPath = coverRaw
      .replace(/^"?\[\[/, '')
      .replace(/\]\]"?$/, '')
      .trim();

    if (coverPath) {
      loadVaultImageUrl(this.app, coverPath).then((url) => {
        if (url) {
          // Revoke old blob URL if one was set
          if (img.src.startsWith('blob:')) {
            URL.revokeObjectURL(img.src);
            this.objectUrls = this.objectUrls.filter((u) => u !== img.src);
          }
          this.objectUrls.push(url);
          img.src = url;
          imgWrap.removeClass('covershelf-no-cover');
        }
      });
    }
  }

  onClose() {
    this.objectUrls.forEach((url) => URL.revokeObjectURL(url));
    this.contentEl.empty();
  }
}
