import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

type TextnextBookInput = {
  id?: string;
  title?: string;
  isbn?: string | null;
  imageUrl?: string | null;
};

type LibraryStatus = {
  name: string;
  status: string;
  available: boolean;
};

type LibraryBook = {
  source: "textnext" | "external";
  itemId?: string;
  title: string;
  isbn: string;
  authors?: string[];
  publisher?: string | null;
  imageUrl?: string | null;
  reserveUrl?: string | null;
  statuses: LibraryStatus[];
  hasHolding: boolean;
  fetchedAt: string;
};

type LibrarySearchError = {
  source: "google_books" | "calil";
  message: string;
};

type LibrarySearchDebug = {
  query: string;
  mode: "keyword" | "selected_item";
  systemId: string;
  textnextIsbnCount: number;
  googleBooksRawCount: number;
  googleBooksWithIsbnCount: number;
  externalIsbnCount: number;
  externalCalilHitCount: number;
};

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const calilCache = new Map<string, CacheEntry<Map<string, any>>>();
const googleCache = new Map<string, CacheEntry<BookSearchProviderResult>>();
const CALIL_CACHE_MS = 7 * 60 * 1000;
const GOOGLE_CACHE_MS = 12 * 60 * 60 * 1000;

const normalizeIsbn = (value: unknown) => String(value || "").replace(/\D/g, "");

const isIsbn13 = (value: string) => /^97[89]\d{10}$/.test(value);

const unique = <T,>(values: T[]) => Array.from(new Set(values));

const withTimeout = async <T,>(promise: Promise<T>, ms: number, message: string): Promise<T> => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

async function fetchCalilOnce(isbns: string[]) {
  const appKey = process.env.CALIL_APP_KEY;
  if (!appKey) throw new Error("missing_calil_app_key");

  const systemId = process.env.CALIL_SYSTEM_ID || "Univ_Titech";
  const url = new URL("https://api.calil.jp/check");
  url.searchParams.set("appkey", appKey);
  url.searchParams.set("isbn", isbns.join(","));
  url.searchParams.set("systemid", systemId);
  url.searchParams.set("format", "json");
  url.searchParams.set("callback", "no");

  const response = await fetch(url, { cache: "no-store" });
  const text = await response.text();
  if (!response.ok) throw new Error(`calil_${response.status}`);
  return JSON.parse(text);
}

async function fetchCalilAvailability(isbns: string[]) {
  const normalized = unique(isbns.map(normalizeIsbn).filter(isIsbn13)).slice(0, 20);
  if (normalized.length === 0) return new Map<string, any>();

  const cacheKey = `${process.env.CALIL_SYSTEM_ID || "Univ_Titech"}:${normalized.sort().join(",")}`;
  const cached = calilCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  let payload = await withTimeout(fetchCalilOnce(normalized), 10000, "calil_timeout");
  let attempts = 0;

  while (payload?.continue === 1 && payload.session && attempts < 6) {
    attempts += 1;
    await new Promise((resolve) => setTimeout(resolve, 850));
    const appKey = process.env.CALIL_APP_KEY;
    const url = new URL("https://api.calil.jp/check");
    url.searchParams.set("appkey", appKey || "");
    url.searchParams.set("session", payload.session);
    url.searchParams.set("format", "json");
    url.searchParams.set("callback", "no");
    const response = await fetch(url, { cache: "no-store" });
    const text = await response.text();
    if (!response.ok) break;
    payload = JSON.parse(text);
  }

  const systemId = process.env.CALIL_SYSTEM_ID || "Univ_Titech";
  const books = new Map<string, any>();
  for (const isbn of normalized) {
    const result = payload?.books?.[isbn]?.[systemId] ?? null;
    books.set(isbn, result);
  }

  calilCache.set(cacheKey, { expiresAt: Date.now() + CALIL_CACHE_MS, value: books });
  return books;
}

const NON_HOLDING_STATUS_PATTERNS = [
  "蔵書なし",
  "所蔵なし",
  "データなし",
  "取得失敗",
  "なし",
  "Not Found",
  "Error",
];

function isHoldingStatus(status: string) {
  const normalized = status.trim();
  if (!normalized) return false;
  return !NON_HOLDING_STATUS_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function normalizeLibraryStatuses(result: any): { statuses: LibraryStatus[]; hasHolding: boolean; reserveUrl?: string | null } {
  const libkey = result?.libkey && typeof result.libkey === "object" ? result.libkey : {};
  const entries = Object.entries(libkey) as Array<[string, unknown]>;

  const statuses = entries
    .map(([name, rawStatus]) => {
      const status = String(rawStatus || "状況不明");
      return {
        name,
        status,
        available: status.includes("貸出可") || status.includes("利用可") || status.includes("在架"),
      };
    })
    .filter((entry) => isHoldingStatus(entry.status));
  const hasHolding = statuses.length > 0;

  return {
    statuses,
    hasHolding,
    reserveUrl: result?.reserveurl || null,
  };
}

function createNoHoldingStatuses(result: any): LibraryStatus[] {
  const libkey = result?.libkey && typeof result.libkey === "object" ? result.libkey : {};
  const entries = Object.entries(libkey) as Array<[string, unknown]>;
  if (entries.length === 0) return [];
  return entries.map(([name, rawStatus]) => ({
      name,
      status: String(rawStatus || "蔵書なし"),
      available: false,
    }));
}

type ExternalBookCandidate = {
  title: string;
  isbn: string;
  authors?: string[];
  publisher?: string | null;
  imageUrl?: string | null;
};

type BookSearchProviderResult = {
  candidates: ExternalBookCandidate[];
  rawCount: number;
  withIsbnCount: number;
};

async function searchGoogleBooks(query: string): Promise<BookSearchProviderResult> {
  const trimmed = query.trim();
  if (trimmed.length <= 2) return { candidates: [], rawCount: 0, withIsbnCount: 0 };

  const cacheKey = trimmed.toLowerCase();
  const cached = googleCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const apiKey = process.env.GOOGLE_BOOKS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_BOOKS_API_KEY;
  const queries = unique([trimmed, `intitle:${trimmed}`]);
  const seen = new Set<string>();
  const candidates: ExternalBookCandidate[] = [];
  let rawCount = 0;
  let withIsbnCount = 0;

  for (const googleQuery of queries) {
    const url = new URL("https://www.googleapis.com/books/v1/volumes");
    url.searchParams.set("q", googleQuery);
    url.searchParams.set("maxResults", "20");
    url.searchParams.set("printType", "books");
    url.searchParams.set("langRestrict", "ja");
    url.searchParams.set("orderBy", "relevance");
    if (apiKey) url.searchParams.set("key", apiKey);

    const response = await fetch(url, { next: { revalidate: 60 * 60 * 12 } });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error?.message || "google_books_failed");

    const items = Array.isArray(payload?.items) ? payload.items : [];
    rawCount += items.length;

    for (const item of items) {
      const info = item?.volumeInfo;
      const isbn = (info?.industryIdentifiers ?? [])
        .map((entry: any) => normalizeIsbn(entry?.identifier))
        .find(isIsbn13);

      if (!isbn || !info?.title) continue;
      withIsbnCount += 1;
      if (seen.has(isbn)) continue;
      seen.add(isbn);
      candidates.push({
        title: info.title,
        isbn,
        authors: Array.isArray(info.authors) ? info.authors.slice(0, 3) : [],
        publisher: info.publisher || null,
        imageUrl: info.imageLinks?.thumbnail?.replace(/^http:\/\//, "https://") || null,
      });

      if (candidates.length >= 20) break;
    }

    if (candidates.length >= 20) break;
  }

  const result = { candidates, rawCount, withIsbnCount };
  googleCache.set(cacheKey, { expiresAt: Date.now() + GOOGLE_CACHE_MS, value: result });
  return result;
}

const bookSearchProviders = [
  searchGoogleBooks,
  // searchNdlBooks can be added here later without changing the route shape.
];

function toTextnextLibraryBook(book: TextnextBookInput, result: any, fetchedAt: string): LibraryBook | null {
  const isbn = normalizeIsbn(book.isbn);
  if (!isIsbn13(isbn) || !book.title) return null;
  const normalized = normalizeLibraryStatuses(result);
  return {
    source: "textnext",
    itemId: book.id,
    title: book.title,
    isbn,
    imageUrl: book.imageUrl || null,
    reserveUrl: normalized.reserveUrl,
    statuses: normalized.hasHolding ? normalized.statuses : createNoHoldingStatuses(result),
    hasHolding: normalized.hasHolding,
    fetchedAt,
  };
}

function toExternalLibraryBook(book: ExternalBookCandidate, result: any, fetchedAt: string): LibraryBook | null {
  const normalized = normalizeLibraryStatuses(result);
  if (!normalized.hasHolding) return null;
  return {
    source: "external",
    title: book.title,
    isbn: book.isbn,
    authors: book.authors,
    publisher: book.publisher,
    imageUrl: book.imageUrl,
    reserveUrl: normalized.reserveUrl,
    statuses: normalized.statuses,
    hasHolding: normalized.hasHolding,
    fetchedAt,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const query = String(body.query || "").trim();
    const mode = body.mode === "selected_item" ? "selected_item" : "keyword";
    const systemId = process.env.CALIL_SYSTEM_ID || "Univ_Titech";
    const errors: LibrarySearchError[] = [];
    const textnextBooks = Array.isArray(body.textnextBooks)
      ? (body.textnextBooks as TextnextBookInput[])
          .map((book) => ({
            ...book,
            isbn: normalizeIsbn(book.isbn),
          }))
          .filter((book) => isIsbn13(String(book.isbn)) && book.title)
          .slice(0, mode === "selected_item" ? 1 : 12)
      : [];

    if (mode === "selected_item" && textnextBooks.length === 0) {
      return NextResponse.json({
        textnextResults: [],
        externalResults: [],
        textnext: [],
        suggestions: [],
        errors,
        debug: process.env.NODE_ENV !== "production" ? {
          query,
          mode,
          systemId,
          textnextIsbnCount: 0,
          googleBooksRawCount: 0,
          googleBooksWithIsbnCount: 0,
          externalIsbnCount: 0,
          externalCalilHitCount: 0,
        } : undefined,
        fetchedAt: new Date().toISOString(),
      });
    }

    const textnextIsbns = textnextBooks.map((book) => String(book.isbn));
    let externalCandidates: ExternalBookCandidate[] = [];
    let googleBooksRawCount = 0;
    let googleBooksWithIsbnCount = 0;
    if (mode === "keyword" && query.length > 2) {
      for (const provider of bookSearchProviders) {
        try {
          const result = await provider(query);
          googleBooksRawCount += result.rawCount;
          googleBooksWithIsbnCount += result.withIsbnCount;
          externalCandidates = [...externalCandidates, ...result.candidates];
        } catch (err: any) {
          console.warn("Book search provider failed:", err);
          errors.push({
            source: "google_books",
            message: err.message || "Google Books request failed",
          });
        }
      }
    }

    const externalByIsbn = new Map<string, ExternalBookCandidate>();
    for (const candidate of externalCandidates) {
      if (!externalByIsbn.has(candidate.isbn)) {
        externalByIsbn.set(candidate.isbn, candidate);
      }
    }
    externalCandidates = Array.from(externalByIsbn.values());

    const externalIsbns = externalCandidates
      .map((book) => book.isbn)
      .filter((isbn) => !textnextIsbns.includes(isbn))
      .slice(0, 20);

    const allIsbns = unique([...textnextIsbns, ...externalIsbns]).slice(0, 20);
    const fetchedAt = new Date().toISOString();
    let calilResults = new Map<string, any>();
    try {
      calilResults = await fetchCalilAvailability(allIsbns);
    } catch (err: any) {
      console.error("Calil lookup failed:", err);
      if (err.message === "missing_calil_app_key") {
        return NextResponse.json(
          { error: "missing_calil_app_key" },
          { status: 503 }
        );
      }
      errors.push({
        source: "calil",
        message: err.message || "Calil request failed",
      });
    }

    const textnextResults = textnextBooks
      .map((book) => toTextnextLibraryBook(book, calilResults.get(String(book.isbn)), fetchedAt))
      .filter((book): book is LibraryBook => Boolean(book));

    const externalResults = externalCandidates
      .filter((book) => externalIsbns.includes(book.isbn))
      .map((book) => toExternalLibraryBook(book, calilResults.get(book.isbn), fetchedAt))
      .filter((book): book is LibraryBook => Boolean(book))
      .slice(0, 8);

    const debug: LibrarySearchDebug = {
      query,
      mode,
      systemId,
      textnextIsbnCount: textnextIsbns.length,
      googleBooksRawCount,
      googleBooksWithIsbnCount,
      externalIsbnCount: externalIsbns.length,
      externalCalilHitCount: externalResults.length,
    };

    console.log("[library-search]", debug);

    return NextResponse.json({
      textnextResults,
      externalResults,
      errors,
      debug: process.env.NODE_ENV !== "production" ? debug : undefined,
      // Backward-compatible aliases for the current client while rollout completes.
      textnext: textnextResults,
      suggestions: externalResults,
      fetchedAt,
    });
  } catch (err: any) {
    console.error("Library search error:", err);
    return NextResponse.json(
      { error: err.message || "library_search_failed" },
      { status: err.message === "missing_calil_app_key" ? 503 : 500 }
    );
  }
}
