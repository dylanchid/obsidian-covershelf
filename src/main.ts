import { App, Menu, Notice, Plugin, TFile } from 'obsidian';
import { CovershelfSettings, DEFAULT_SETTINGS } from './types';
import { getBooksInFolder } from './note-writer';
import { CoverPickerModal } from './cover-picker-modal';
import { FillMissingModal } from './fill-missing-modal';
import { LibraryOverviewModal } from './library-overview-modal';
import { CovershelfSettingTab } from './settings';

export default class CovershelfPlugin extends Plugin {
  settings: CovershelfSettings = DEFAULT_SETTINGS;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new CovershelfSettingTab(this.app, this));

    // Ribbon icon
    this.addRibbonIcon('book-open', 'CoverShelf: Open Cover Library', () => {
      new LibraryOverviewModal(this.app, this.settings).open();
    });

    // Right-click context menu on book files
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu: Menu, file) => {
        if (!(file instanceof TFile)) return;
        if (file.extension !== 'md') return;
        if (file.parent?.path !== this.settings.booksFolder) return;

        menu.addItem((item) => {
          item
            .setTitle('Change book cover')
            .setIcon('image')
            .onClick(() => {
              const books = getBooksInFolder(this.app, this.settings);
              const book = books.find((b) => b.file.path === file.path);
              if (!book) {
                new Notice('Could not read book metadata from this note.');
                return;
              }
              new CoverPickerModal(this.app, book, this.settings, () => {}).open();
            });
        });
      })
    );

    // Command: open cover picker for the active book note
    this.addCommand({
      id: 'pick-cover',
      name: 'Pick cover for this book',
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== 'md') return false;
        if (file.parent?.path !== this.settings.booksFolder) return false;

        if (!checking) {
          const books = getBooksInFolder(this.app, this.settings);
          const book = books.find((b) => b.file.path === file.path);
          if (!book) {
            new Notice('Could not read book metadata from this note.');
            return true;
          }
          new CoverPickerModal(this.app, book, this.settings, () => {}).open();
        }
        return true;
      },
    });

    // Command: fill all missing covers
    this.addCommand({
      id: 'fill-missing',
      name: 'Fill missing covers',
      callback: () => {
        const books = getBooksInFolder(this.app, this.settings);
        const missing = books.filter((b) => !b.currentCoverPath);

        if (missing.length === 0) {
          new Notice('All books already have covers.');
          return;
        }

        new FillMissingModal(this.app, missing, this.settings, () => {}).open();
      },
    });

    // Command: open library overview
    this.addCommand({
      id: 'open-library',
      name: 'Open Cover Library',
      callback: () => {
        new LibraryOverviewModal(this.app, this.settings).open();
      },
    });
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
