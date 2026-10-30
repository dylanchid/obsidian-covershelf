import { requestUrl } from 'obsidian';
import { CoverResult } from './types';

// ---------------------------------------------------------------------------
// Google Books
// ---------------------------------------------------------------------------

/**
 * Adjusts a Google Books thumbnail URL to a target zoom level and strips
 * the page-curl edge effect.
 *
 * Zoom levels observed in practice:
 *   1 = 128×192   (9 KB)   — used as grid thumbnail src for fast loading
 *   3 = 575×863   (54 KB)  — used as hover/preview
 *   0 = 1652×2478 (248 KB) — used for vault download
 */
function googleBooksUrl(thumbnailUrl: string, zoom: number): string {
  return thumbnailUrl
    .replace('http://', 'https://')
    .replace(/zoom=\d+/, `zoom=${zoom}`)
    .replace('&edge=curl', '');
}

function googleBooksQuery(title: string, author: string, isbn?: string): string {
  const isbnValue = isbn?.trim();
  if (isbnValue) return `isbn:${isbnValue}`;

  const parts: string[] = [];
  const titleValue = title.trim();
  const authorValue = author.trim();
  if (titleValue) parts.push(`intitle:"${titleValue}"`);
  if (authorValue) parts.push(`inauthor:"${authorValue}"`);
  return parts.join(' ');
}

export interface CoverSearchResponse {
  results: CoverResult[];
  error?: string;
}

export async function searchGoogleBooks(
  title: string,
  author: string,
  isbn?: string
): Promise<CoverSearchResponse> {
  const query = googleBooksQuery(title, author, isbn);
  if (!query) return { results: [] };

  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=6`;

  try {
    const response = await requestUrl({ url });
    const data = response.json;

    if (!data.items) return { results: [] };

    return {
      results: data.items
        .filter((item: any) => item.volumeInfo?.imageLinks?.thumbnail)
        .map((item: any): CoverResult => {
          const thumb: string = item.volumeInfo.imageLinks.thumbnail;
          return {
            id: `gb-${item.id}`,
            source: 'google-books',
            displayUrl: googleBooksUrl(thumb, 1),
            downloadUrl: googleBooksUrl(thumb, 0),
            meta: {
              publisher: item.volumeInfo.publisher,
              year: item.volumeInfo.publishedDate?.split('-')[0],
            },
          };
        }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { results: [], error: message };
  }
}

// ---------------------------------------------------------------------------
// Open Library
// ---------------------------------------------------------------------------

function olCoverUrl(coverId: number, size: 'S' | 'M' | 'L'): string {
  return `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg`;
}

export async function searchOpenLibrary(
  title: string,
  author: string,
  isbn?: string
): Promise<{ results: CoverResult[]; workKey?: string }> {
  const isbnValue = isbn?.trim();
  const params = isbnValue
    ? `isbn=${encodeURIComponent(isbnValue)}`
    : [
        title.trim() && `title=${encodeURIComponent(title.trim())}`,
        author.trim() && `author=${encodeURIComponent(author.trim())}`,
      ]
        .filter(Boolean)
        .join('&');
  if (!params) return { results: [] };
  const url = `https://openlibrary.org/search.json?${params}&fields=key,cover_i&limit=5`;

  try {
    const response = await requestUrl({ url });
    const data = response.json;

    const docs: any[] = data.docs ?? [];
    const withCover = docs.find((d: any) => d.cover_i);

    if (!withCover) return { results: [] };

    const result: CoverResult = {
      id: `ol-${withCover.cover_i}`,
      source: 'open-library',
      displayUrl: olCoverUrl(withCover.cover_i, 'M'),
      downloadUrl: olCoverUrl(withCover.cover_i, 'L'),
      meta: {},
    };

    return { results: [result], workKey: withCover.key };
  } catch {
    return { results: [] };
  }
}

/** Fetches all editions of an OL work that have cover images. */
export async function getOpenLibraryEditions(workKey: string): Promise<CoverResult[]> {
  const url = `https://openlibrary.org${workKey}/editions.json?limit=50&fields=covers,publishers,publish_date`;

  try {
    const response = await requestUrl({ url });
    const data = response.json;
    const entries: any[] = data.entries ?? [];

    const seen = new Set<number>();
    const results: CoverResult[] = [];

    for (const entry of entries) {
      const covers: number[] = entry.covers ?? [];
      if (!covers.length) continue;
      const coverId = covers[0];
      if (seen.has(coverId)) continue;
      seen.add(coverId);

      const yearRaw: string = entry.publish_date ?? '';
      const yearMatch = yearRaw.match(/\d{4}/);

      results.push({
        id: `ol-ed-${coverId}`,
        source: 'open-library',
        displayUrl: olCoverUrl(coverId, 'M'),
        downloadUrl: olCoverUrl(coverId, 'L'),
        meta: {
          publisher: entry.publishers?.[0],
          year: yearMatch ? yearMatch[0] : undefined,
        },
      });
    }

    return results;
  } catch {
    return [];
  }
}

/** Downloads image bytes from a URL. Works for both Google Books and OL covers. */
export async function downloadCoverImage(url: string): Promise<ArrayBuffer> {
  const response = await requestUrl({ url });
  return response.arrayBuffer;
}
