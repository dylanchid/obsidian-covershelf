import { App, Modal, Notice } from 'obsidian';
import {
  searchGoogleBooks,
  searchOpenLibrary,
  getOpenLibraryEditions,
  downloadCoverImage,
} from './api';
import { applyNewCover, loadVaultImageUrl } from './note-writer';
import { BookInfo, CoverResult, CovershelfSettings } from './types';

export class CoverPickerModal extends Modal {
  private book: BookInfo;
  private settings: CovershelfSettings;
  private onApplied: () => void;

  private selected: CoverResult | null = null;
  private objectUrls: string[] = [];

  constructor(
    app: App,
    book: BookInfo,
    settings: CovershelfSettings,
    onApplied: () => void
  ) {
    super(app);
    this.book = book;
    this.settings = settings;
    this.onApplied = onApplied;
  }

  onOpen() {
    const { contentEl, modalEl } = this;
    modalEl.addClass('covershelf-picker-modal');
    contentEl.empty();

    // Header
    const header = contentEl.createDiv('covershelf-picker-header');
    header.createEl('h2', { text: this.book.title });
    header.createEl('p', {
      text: this.book.author,
      cls: 'covershelf-picker-author',
    });

    // Body layout: current cover panel + results panel
    const layout = contentEl.createDiv('covershelf-picker-layout');

    // Current cover
    const currentPanel = layout.createDiv('covershelf-current-panel');
    currentPanel.createEl('h3', { text: 'Current' });
    const currentImgWrap = currentPanel.createDiv('covershelf-current-img-wrap');
    const currentImg = currentImgWrap.createEl('img', { cls: 'covershelf-current-img' });
    currentImg.alt = 'Current cover';

    if (this.book.currentCoverPath) {
      loadVaultImageUrl(this.app, this.book.currentCoverPath).then((url) => {
        if (url) {
          this.objectUrls.push(url);
          currentImg.src = url;
        } else {
          currentImgWrap.createEl('p', {
            text: 'No cover',
            cls: 'covershelf-no-cover-placeholder',
          });
        }
      });
    } else {
      currentImgWrap.createEl('p', {
        text: 'No cover',
        cls: 'covershelf-no-cover-placeholder',
      });
    }

    if (this.book.currentCoverPath) {
      currentPanel.createEl('p', {
        text: this.book.currentCoverPath.split('/').pop() ?? '',
        cls: 'covershelf-current-filename',
      });
    }

    // Results panel
    const resultsPanel = layout.createDiv('covershelf-results-panel');

    // Footer (apply button)
    const footer = contentEl.createDiv('covershelf-picker-footer');
    const selectedInfo = footer.createEl('span', {
      text: 'Select a cover to apply',
      cls: 'covershelf-selected-info',
    });

    const applyBtn = footer.createEl('button', {
      text: 'Apply',
      cls: 'mod-cta covershelf-apply-btn',
    });
    applyBtn.disabled = true;
    applyBtn.addEventListener('click', () => this.applySelected(applyBtn, selectedInfo));

    // Fetch results asynchronously
    this.fetchAndRender(resultsPanel, selectedInfo, applyBtn);
  }

  private async fetchAndRender(
    panel: HTMLElement,
    selectedInfo: HTMLElement,
    applyBtn: HTMLButtonElement
  ) {
    const { title, author, isbn } = this.book;

    // ── Google Books ──────────────────────────────────────────────────────
    const gbSection = this.createSourceSection(panel, 'Google Books', true);
    const gbGrid = gbSection.createDiv('covershelf-cover-grid');
    const gbSpinner = gbSection.createDiv('covershelf-spinner');
    gbSpinner.textContent = 'Searching…';

    const gbResults = await searchGoogleBooks(title, author, isbn);
    gbSpinner.remove();

    if (gbResults.length === 0) {
      gbSection.createEl('p', { text: 'No results', cls: 'covershelf-no-results' });
    } else {
      for (const result of gbResults) {
        this.renderCoverItem(gbGrid, result, selectedInfo, applyBtn);
      }
    }

    // ── Open Library ─────────────────────────────────────────────────────
    const olSection = this.createSourceSection(panel, 'Open Library');
    const olGrid = olSection.createDiv('covershelf-cover-grid');
    const olSpinner = olSection.createDiv('covershelf-spinner');
    olSpinner.textContent = 'Searching…';

    const { results: olResults, workKey } = await searchOpenLibrary(title, author, isbn);
    olSpinner.remove();

    // If we have a work key, fetch all editions with covers
    const editionResults = workKey
      ? await getOpenLibraryEditions(workKey)
      : olResults;

    const allOlResults = workKey ? editionResults : olResults;

    if (allOlResults.length === 0) {
      olSection.createEl('p', { text: 'No results', cls: 'covershelf-no-results' });
    } else {
      for (const result of allOlResults) {
        this.renderCoverItem(olGrid, result, selectedInfo, applyBtn);
      }
    }
  }

  private createSourceSection(
    parent: HTMLElement,
    label: string,
    isPrimary = false
  ): HTMLElement {
    const section = parent.createDiv('covershelf-source-section');
    const labelEl = section.createEl('div', {
      text: label,
      cls: 'covershelf-source-label',
    });
    if (isPrimary) {
      labelEl.createEl('span', {
        text: ' · recommended',
        cls: 'covershelf-source-tag',
      });
    }
    return section;
  }

  private renderCoverItem(
    grid: HTMLElement,
    result: CoverResult,
    selectedInfo: HTMLElement,
    applyBtn: HTMLButtonElement
  ) {
    const item = grid.createDiv('covershelf-cover-item');

    const img = item.createEl('img', { cls: 'covershelf-cover-img' });
    img.alt = 'Book cover';
    img.src = result.displayUrl;
    img.loading = 'lazy';

    // Show meta below the image
    const meta = [result.meta.year, result.meta.publisher]
      .filter(Boolean)
      .join(' · ');
    if (meta) {
      item.createEl('div', { text: meta, cls: 'covershelf-cover-meta' });
    }

    item.addEventListener('click', () => {
      // Deselect all
      grid.closest('.covershelf-results-panel')
        ?.querySelectorAll('.covershelf-cover-item.is-selected')
        .forEach((el) => el.removeClass('is-selected'));

      item.addClass('is-selected');
      this.selected = result;
      applyBtn.disabled = false;

      const sourceLabel = result.source === 'google-books' ? 'Google Books' : 'Open Library';
      const metaLabel = meta ? ` — ${meta}` : '';
      selectedInfo.textContent = `${sourceLabel}${metaLabel}`;
    });
  }

  private async applySelected(
    applyBtn: HTMLButtonElement,
    selectedInfo: HTMLElement
  ) {
    if (!this.selected) return;

    applyBtn.disabled = true;
    applyBtn.textContent = 'Downloading…';
    selectedInfo.textContent = 'Fetching high-res image…';

    try {
      const data = await downloadCoverImage(this.selected.downloadUrl);
      await applyNewCover(this.app, this.book, data, this.settings);
      new Notice(`Cover updated for "${this.book.title}"`);
      this.onApplied();
      this.close();
    } catch (err) {
      new Notice(`Failed to apply cover: ${err}`);
      applyBtn.disabled = false;
      applyBtn.textContent = 'Apply';
      selectedInfo.textContent = 'Error — try again';
    }
  }

  onClose() {
    this.objectUrls.forEach((url) => URL.revokeObjectURL(url));
    this.contentEl.empty();
  }
}
