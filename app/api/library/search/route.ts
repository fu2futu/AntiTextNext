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

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const calilCache = new Map<string, CacheEntry<Map<string, any>>>();
const googleCache = new Map<string, CacheEntry<ExternalBookCandidate[]>>();
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

  const systemId = process.env.CALIL_SYSTEM_ID || "TokyoTech";
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

  const cacheKey = `${process.env.CALIL_SYSTEM_ID || "TokyoTech"}:${normalized.sort().join(",")}`;
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

  const systemId = process.env.CALIL_SYSTEM_ID || "TokyoTech";
  const books = new Map<string, any>();
  for (const isbn of normalized) {
    const result = payload?.books?.[isbn]?.[systemId] ?? null;
    books.set(isbn, result);
  }

  calilCache.set(cacheKey, { expiresAt: Date.now() + CALIL_CACHE_MS, value: books });
  return books;
}

function normalizeLibraryStatuses(result: any): { statuses: LibraryStatus[]; hasHolding: boolean; reserveUrl?: string | null } {
  const libkey = result?.libkey && typeof result.libkey === "object" ? result.libkey : {};
  const entries = Object.entries(libkey) as Array<[string, unknown]>;
  const hasHolding = entries.length > 0;

  const statuses = entries.map(([name, rawStatus]) => {
    const status = String(rawStatus || "状況不明");
    return {
      name,
      status,
      available: status.includes("貸出可") || status.includes("利用可") || status.includes("在架"),
    };
  });

  return {
    statuses,
    hasHolding,
    reserveUrl: result?.reserveurl || null,
  };
}

type ExternalBookCandidate = {
  title: string;
  isbn: string;
  authors?: string[];
  publisher?: string | null;
  imageUrl?: string | null;
};

async function fetchGoogleCandidates(query: string) {
  const trimmed = query.trim();
  if (trimmed.length <= 2) return [];

  const cacheKey = trimmed.toLowerCase();
  const cached = googleCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const apiKey = process.env.GOOGLE_BOOKS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_BOOKS_API_KEY;
  const url = new URL("https://www.googleapis.com/books/v1/volumes");
  url.searchParams.set("q", trimmed);
  url.searchParams.set("maxResults", "20");
  url.searchParams.set("printType", "books");
  url.searchParams.set("langRestrict", "ja");
  if (apiKey) url.searchParams.set("key", apiKey);

  const response = await fetch(url, { next: { revalidate: 60 * 60 * 12 } });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || "google_books_failed");

  const seen = new Set<string>();
  const candidates: ExternalBookCandidate[] = [];
  for (const item of payload?.items ?? []) {
    const info = item?.volumeInfo;
    const isbn = (info?.industryIdentifiers ?? [])
      .map((entry: any) => normalizeIsbn(entry?.identifier))
      .find(isIsbn13);

    if (!isbn || seen.has(isbn) || !info?.title) continue;
    seen.add(isbn);
    candidates.push({
      title: info.title,
      isbn,
      authors: Array.isArray(info.authors) ? info.authors.slice(0, 3) : [],
      publisher: info.publisher || null,
      imageUrl: info.imageLinks?.thumbnail?.replace(/^http:\/\//, "https://") || null,
    });

    if (candidates.length >= 12) break;
  }

  googleCache.set(cacheKey, { expiresAt: Date.now() + GOOGLE_CACHE_MS, value: candidates });
  return candidates;
}

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
    statuses: normalized.statuses,
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
        textnext: [],
        suggestions: [],
        fetchedAt: new Date().toISOString(),
      });
    }

    const textnextIsbns = textnextBooks.map((book) => String(book.isbn));
    let externalCandidates: ExternalBookCandidate[] = [];
    if (mode === "keyword" && query.length > 2) {
      try {
        externalCandidates = await fetchGoogleCandidates(query);
      } catch (err) {
        console.warn("Google Books lookup failed:", err);
      }
    }
    const externalIsbns = externalCandidates
      .map((book) => book.isbn)
      .filter((isbn) => !textnextIsbns.includes(isbn))
      .slice(0, 12);

    const allIsbns = unique([...textnextIsbns, ...externalIsbns]).slice(0, 20);
    const fetchedAt = new Date().toISOString();
    const calilResults = await fetchCalilAvailability(allIsbns);

    const textnext = textnextBooks
      .map((book) => toTextnextLibraryBook(book, calilResults.get(String(book.isbn)), fetchedAt))
      .filter((book): book is LibraryBook => Boolean(book));

    const suggestions = externalCandidates
      .filter((book) => externalIsbns.includes(book.isbn))
      .map((book) => toExternalLibraryBook(book, calilResults.get(book.isbn), fetchedAt))
      .filter((book): book is LibraryBook => Boolean(book))
      .slice(0, 8);

    return NextResponse.json({
      textnext,
      suggestions,
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
