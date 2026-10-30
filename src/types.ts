import { TFile } from 'obsidian';

export interface BookInfo {
  file: TFile;
  title: string;
  author: string;
  isbn?: string;
  /** Vault-relative path to the current cover image, e.g. "Books/covers/Blood_Meridian.jpg" */
  currentCoverPath?: string;
}

export interface CoverResult {
  id: string;
  source: 'google-books' | 'open-library';
  /** Medium-res URL for grid thumbnails */
  displayUrl: string;
  /** Highest available res URL for downloading to vault */
  downloadUrl: string;
  meta: {
    publisher?: string;
    year?: string;
  };
}

export interface CovershelfSettings {
  booksFolder: string;
  coversFolder: string;
}

export const DEFAULT_SETTINGS: CovershelfSettings = {
  booksFolder: 'Books',
  coversFolder: 'Books/covers',
};
