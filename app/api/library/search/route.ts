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
  itemIds?: string[];
  textnextItemCount?: number;
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
  source: "google_books" | "ndl" | "calil";
  message: string;
};

type LibrarySearchDebug = {
  query: string;
  mode: "keyword" | "selected_item";
  systemId: string;
  textnextIsbnCount: number;
  googleBooksRawCount: number;
  googleBooksWithIsbnCount: number;
  ndlRawCount: number;
  ndlWithIsbnCount: number;
  externalIsbnCount: number;
  externalCalilCheckedCount: number;
  textnextCalilHitCount: number;
  externalCalilHitCount: number;
  calilContinueCount: number;
  calilCompleted: boolean;
  calilLibkeysSeen: string[];
  calilRawStatusesSample: Array<{ isbn: string; statuses: Record<string, string> }>;
  sampleExternalTitles: string[];
  sampleExternalIsbns: string[];
  externalProviderBreakdown: Record<string, { rawCount: number; withIsbnCount: number; candidateCount: number }>;
  ndlRequestUrlWithoutSecrets?: string[];
  ndlHttpStatus?: number[];
  ndlResponseContentType?: string[];
  ndlResponseTextSample?: string;
  ndlItemCountBeforeParse?: number;
  ndlParsedItemCount?: number;
  ndlIdentifierSamples?: string[];
  ndlError?: string;
  calilChunks: Array<{
    type: "textnext" | "external";
    isbnCount: number;
    completed: boolean;
    continueCount: number;
    hitCount: number;
  }>;
  externalCandidatesBeforeLimitCount: number;
  externalCandidatesAfterLimitCount: number;
  externalLimit: number;
  externalDroppedByLimitCount: number;
  sampleExternalTitlesBeforeLimit: string[];
  sampleExternalTitlesAfterLimit: string[];
  sampleDroppedExternalTitles: string[];
};

type CalilLookupResult = {
  books: Map<string, any>;
  continueCount: number;
  completed: boolean;
  libkeysSeen: string[];
  rawStatusesSample: Array<{ isbn: string; statuses: Record<string, string> }>;
};

type CalilChunkDebug = {
  type: "textnext" | "external";
  isbnCount: number;
  completed: boolean;
  continueCount: number;
  hitCount: number;
};

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const calilCache = new Map<string, CacheEntry<CalilLookupResult>>();
const googleCache = new Map<string, CacheEntry<BookSearchProviderResult>>();
const ndlCache = new Map<string, CacheEntry<BookSearchProviderResult>>();
const CALIL_CACHE_MS = 7 * 60 * 1000;
const GOOGLE_CACHE_MS = 12 * 60 * 60 * 1000;
const DEFAULT_EXTERNAL_LIMIT = 10;
const MAX_DEBUG_EXTERNAL_LIMIT = 30;

const normalizeIsbn = (value: unknown) => String(value || "").replace(/[^0-9Xx]/g, "").toUpperCase();

const isIsbn13 = (value: string) => /^97[89]\d{10}$/.test(value);

const isIsbn10 = (value: string) => /^\d{9}[\dX]$/.test(value);

const isValidIsbn = (value: string) => isIsbn13(value) || isIsbn10(value);

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

async function fetchCalilAvailability(isbns: string[], noCache = false) {
  const normalized = unique(isbns.map(normalizeIsbn).filter(isValidIsbn)).slice(0, 20);
  if (normalized.length === 0) {
    return {
      books: new Map<string, any>(),
      continueCount: 0,
      completed: true,
      libkeysSeen: [],
      rawStatusesSample: [],
    };
  }

  const sortedIsbns = [...normalized].sort();
  const cacheKey = `${process.env.CALIL_SYSTEM_ID || "Univ_Titech"}:${sortedIsbns.join(",")}`;
  const cached = calilCache.get(cacheKey);
  if (!noCache && cached && cached.expiresAt > Date.now()) return cached.value;

  let payload = await withTimeout(fetchCalilOnce(normalized), 10000, "calil_timeout");
  let continueCount = 0;

  while (String(payload?.continue) === "1" && payload.session && continueCount < 10) {
    continueCount += 1;
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
  const libkeysSeen = new Set<string>();
  const rawStatusesSample: Array<{ isbn: string; statuses: Record<string, string> }> = [];
  for (const isbn of sortedIsbns) {
    const result = payload?.books?.[isbn]?.[systemId] ?? null;
    books.set(isbn, result);
    const libkey = result?.libkey && typeof result.libkey === "object" ? result.libkey : {};
    const statusEntries = Object.entries(libkey).reduce<Record<string, string>>((acc, [key, value]) => {
      libkeysSeen.add(key);
      acc[key] = String(value || "");
      return acc;
    }, {});
    if (Object.keys(statusEntries).length > 0 && rawStatusesSample.length < 8) {
      rawStatusesSample.push({ isbn, statuses: statusEntries });
    }
  }

  const result: CalilLookupResult = {
    books,
    continueCount,
    completed: String(payload?.continue) !== "1",
    libkeysSeen: Array.from(libkeysSeen),
    rawStatusesSample,
  };

  if (!noCache && result.completed) {
    calilCache.set(cacheKey, { expiresAt: Date.now() + CALIL_CACHE_MS, value: result });
  }
  return result;
}

function mergeCalilLookups(lookups: CalilLookupResult[]): CalilLookupResult {
  const books = new Map<string, any>();
  const libkeysSeen = new Set<string>();
  const rawStatusesSample: Array<{ isbn: string; statuses: Record<string, string> }> = [];
  let continueCount = 0;
  let completed = true;

  for (const lookup of lookups) {
    lookup.books.forEach((value, key) => books.set(key, value));
    lookup.libkeysSeen.forEach((key) => libkeysSeen.add(key));
    rawStatusesSample.push(...lookup.rawStatusesSample);
    continueCount += lookup.continueCount;
    completed = completed && lookup.completed;
  }

  return {
    books,
    continueCount,
    completed,
    libkeysSeen: Array.from(libkeysSeen),
    rawStatusesSample: rawStatusesSample.slice(0, 8),
  };
}

async function fetchCalilAvailabilityInChunks(
  isbns: string[],
  chunkSize: number,
  type: "textnext" | "external",
  noCache = false
) {
  const normalized = unique(isbns.map(normalizeIsbn).filter(isValidIsbn));
  const lookups: CalilLookupResult[] = [];
  const chunks: CalilChunkDebug[] = [];
  for (let index = 0; index < normalized.length; index += chunkSize) {
    const chunk = normalized.slice(index, index + chunkSize);
    const lookup = await fetchCalilAvailability(chunk, noCache);
    lookups.push(lookup);
    chunks.push({
      type,
      isbnCount: chunk.length,
      completed: lookup.completed,
      continueCount: lookup.continueCount,
      hitCount: Array.from(lookup.books.values()).filter((result) => normalizeLibraryStatuses(result).hasHolding).length,
    });
  }
  return {
    lookup: mergeCalilLookups(lookups),
    chunks,
  };
}

const NON_HOLDING_STATUS_PATTERNS = [
  "蔵書なし",
  "所蔵なし",
  "データなし",
  "取得失敗",
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
  provider: "google_books" | "ndl";
  title: string;
  isbn: string;
  authors?: string[];
  publisher?: string | null;
  imageUrl?: string | null;
};

type BookSearchProviderResult = {
  provider: "google_books" | "ndl";
  candidates: ExternalBookCandidate[];
  rawCount: number;
  withIsbnCount: number;
  debug?: NdlProviderDebug;
};

type NdlProviderDebug = {
  requestUrlWithoutSecrets: string[];
  httpStatus: number[];
  responseContentType: string[];
  responseTextSample: string;
  itemCountBeforeParse: number;
  parsedItemCount: number;
  identifierSamples: string[];
  error?: string;
};

async function searchGoogleBooks(query: string, noCache = false): Promise<BookSearchProviderResult> {
  const trimmed = query.trim();
  if (trimmed.length <= 2) return { provider: "google_books", candidates: [], rawCount: 0, withIsbnCount: 0 };

  const cacheKey = trimmed.toLowerCase();
  const cached = googleCache.get(cacheKey);
  if (!noCache && cached && cached.expiresAt > Date.now()) return cached.value;

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
      const normalizedIsbns = (info?.industryIdentifiers ?? [])
        .map((entry: any) => normalizeIsbn(entry?.identifier))
        .filter(isValidIsbn);
      const isbn = normalizedIsbns.find(isIsbn13) || normalizedIsbns.find(isIsbn10);

      if (!isbn || !info?.title) continue;
      withIsbnCount += 1;
      if (seen.has(isbn)) continue;
      seen.add(isbn);
      candidates.push({
        provider: "google_books",
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

  const result = { provider: "google_books" as const, candidates, rawCount, withIsbnCount };
  if (!noCache) googleCache.set(cacheKey, { expiresAt: Date.now() + GOOGLE_CACHE_MS, value: result });
  return result;
}

const decodeXmlText = (value: string) =>
  value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, "")
    .trim();

const getXmlTagValues = (xml: string, tagName: string) => {
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "gi");
  const values: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    values.push(decodeXmlText(match[1] || ""));
  }
  return values.filter(Boolean);
};

const getXmlLocalTagValues = (xml: string, localName: string) => {
  const escaped = localName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<(?:[\\w.-]+:)?${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${escaped}>`, "gi");
  const values: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    values.push(decodeXmlText(match[1] || ""));
  }
  return values.filter(Boolean);
};

const getXmlRecords = (xml: string) => {
  const itemRecords = Array.from(xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)).map((match) => match[1] || "");
  if (itemRecords.length > 0) return itemRecords;
  return Array.from(xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi)).map((match) => match[1] || "");
};

const extractIsbnsFromValues = (values: string[]) => {
  const isbns = values.flatMap((value) => {
    const matches = value.match(/ISBN(?:-1[03])?[:：]?\s*[0-9Xx\-\s]{10,20}|97[89][0-9Xx\-\s]{10,20}|[0-9][0-9Xx\-\s]{8,16}[0-9Xx]/g) || [];
    return matches.map(normalizeIsbn).filter(isValidIsbn);
  });
  return unique(isbns);
};

async function searchNdlBooks(query: string, noCache = false): Promise<BookSearchProviderResult> {
  const trimmed = query.trim();
  if (trimmed.length <= 2) {
    return {
      provider: "ndl",
      candidates: [],
      rawCount: 0,
      withIsbnCount: 0,
      debug: {
        requestUrlWithoutSecrets: [],
        httpStatus: [],
        responseContentType: [],
        responseTextSample: "",
        itemCountBeforeParse: 0,
        parsedItemCount: 0,
        identifierSamples: [],
      },
    };
  }

  const cacheKey = trimmed.toLowerCase();
  const cached = ndlCache.get(cacheKey);
  if (!noCache && cached && cached.expiresAt > Date.now()) return cached.value;

  const urls = [
    (() => {
      const url = new URL("https://ndlsearch.ndl.go.jp/api/opensearch");
      url.searchParams.set("any", trimmed);
      url.searchParams.set("cnt", "30");
      return url;
    })(),
    (() => {
      const url = new URL("https://ndlsearch.ndl.go.jp/api/opensearch");
      url.searchParams.set("title", trimmed);
      url.searchParams.set("cnt", "30");
      return url;
    })(),
    (() => {
      const url = new URL("https://ndlsearch.ndl.go.jp/api/opensearch");
      url.searchParams.set("any", trimmed);
      url.searchParams.set("cnt", "30");
      url.searchParams.set("mediatype", "1");
      return url;
    })(),
  ];

  const records: string[] = [];
  const identifierSamples = new Set<string>();
  const debug: NdlProviderDebug = {
    requestUrlWithoutSecrets: urls.map((url) => url.toString()),
    httpStatus: [],
    responseContentType: [],
    responseTextSample: "",
    itemCountBeforeParse: 0,
    parsedItemCount: 0,
    identifierSamples: [],
  };

  for (const url of urls) {
    const response = await fetch(url, { next: { revalidate: 60 * 60 * 12 } });
    const xml = await response.text();
    debug.httpStatus.push(response.status);
    debug.responseContentType.push(response.headers.get("content-type") || "");
    if (!debug.responseTextSample && xml) {
      debug.responseTextSample = xml.slice(0, 900);
    }
    if (!response.ok) {
      debug.error = `ndl_${response.status}`;
      continue;
    }
    records.push(...getXmlRecords(xml));
  }

  debug.itemCountBeforeParse = records.length;
  const seen = new Set<string>();
  const candidates: ExternalBookCandidate[] = [];
  let withIsbnCount = 0;

  for (const itemXml of records) {
    const identifiers = [
      ...getXmlLocalTagValues(itemXml, "identifier"),
      ...getXmlTagValues(itemXml, "dc:identifier"),
      ...getXmlTagValues(itemXml, "dcndl:isbn"),
      ...getXmlTagValues(itemXml, "prism:isbn"),
      ...getXmlLocalTagValues(itemXml, "isbn"),
      ...getXmlTagValues(itemXml, "guid"),
      itemXml,
    ];
    for (const value of identifiers.slice(0, 4)) {
      if (value) identifierSamples.add(value.slice(0, 160));
    }
    const normalizedIsbns = extractIsbnsFromValues(identifiers);
    const isbn = normalizedIsbns.find(isIsbn13) || normalizedIsbns.find(isIsbn10);
    if (!isbn) continue;
    withIsbnCount += 1;
    if (seen.has(isbn)) continue;
    seen.add(isbn);

    const title = getXmlLocalTagValues(itemXml, "title")[0] || getXmlTagValues(itemXml, "dc:title")[0];
    if (!title) continue;
    const authors = unique([
      ...getXmlLocalTagValues(itemXml, "author"),
      ...getXmlTagValues(itemXml, "dc:creator"),
      ...getXmlLocalTagValues(itemXml, "creator"),
    ]).slice(0, 3);

    candidates.push({
      provider: "ndl",
      title,
      isbn,
      authors,
      publisher: getXmlTagValues(itemXml, "dc:publisher")[0] || getXmlLocalTagValues(itemXml, "publisher")[0] || null,
      imageUrl: null,
    });

    if (candidates.length >= 20) break;
  }
  debug.parsedItemCount = candidates.length;
  debug.identifierSamples = Array.from(identifierSamples).slice(0, 8);

  const result = {
    provider: "ndl" as const,
    candidates,
    rawCount: records.length,
    withIsbnCount,
    debug,
  };
  if (!noCache) ndlCache.set(cacheKey, { expiresAt: Date.now() + GOOGLE_CACHE_MS, value: result });
  return result;
}

const bookSearchProviders = [
  searchGoogleBooks,
  searchNdlBooks,
];

function toTextnextLibraryBook(book: TextnextBookInput, result: any, fetchedAt: string): LibraryBook | null {
  const isbn = normalizeIsbn(book.isbn);
  if (!isValidIsbn(isbn) || !book.title) return null;
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

async function handleLibrarySearch(request: NextRequest, body: any) {
  try {
    const query = String(body.query || "").trim();
    const mode = body.mode === "selected_item" ? "selected_item" : "keyword";
    const systemId = process.env.CALIL_SYSTEM_ID || "Univ_Titech";
    const includeDebug = process.env.NODE_ENV !== "production" ||
      (process.env.ENABLE_LIBRARY_DEBUG === "true" && request.nextUrl.searchParams.get("debug") === "1");
    const noCache = includeDebug && request.nextUrl.searchParams.get("noCache") === "1";
    const requestedExternalLimit = Number(request.nextUrl.searchParams.get("externalLimit") || "");
    const externalLimit = includeDebug && Number.isFinite(requestedExternalLimit) && requestedExternalLimit > 0
      ? Math.min(Math.floor(requestedExternalLimit), MAX_DEBUG_EXTERNAL_LIMIT)
      : DEFAULT_EXTERNAL_LIMIT;
    const errors: LibrarySearchError[] = [];
    const textnextBooks = Array.isArray(body.textnextBooks)
      ? (body.textnextBooks as TextnextBookInput[])
          .map((book) => ({
            ...book,
            isbn: normalizeIsbn(book.isbn),
          }))
          .filter((book) => isValidIsbn(String(book.isbn)) && book.title)
          .slice(0, mode === "selected_item" ? 1 : 12)
      : [];
    const textnextBooksByIsbn = new Map<string, TextnextBookInput[]>();
    for (const book of textnextBooks) {
      const isbn = String(book.isbn);
      const books = textnextBooksByIsbn.get(isbn) || [];
      books.push(book);
      textnextBooksByIsbn.set(isbn, books);
    }
    const groupedTextnextBooks = Array.from(textnextBooksByIsbn.values()).map((books) => books[0]);

    if (mode === "selected_item" && textnextBooks.length === 0) {
      const debug: LibrarySearchDebug = {
        query,
        mode,
        systemId,
        textnextIsbnCount: 0,
        googleBooksRawCount: 0,
        googleBooksWithIsbnCount: 0,
        ndlRawCount: 0,
        ndlWithIsbnCount: 0,
        externalIsbnCount: 0,
        externalCalilCheckedCount: 0,
        textnextCalilHitCount: 0,
        externalCalilHitCount: 0,
        calilContinueCount: 0,
        calilCompleted: true,
        calilLibkeysSeen: [],
        calilRawStatusesSample: [],
        sampleExternalTitles: [],
        sampleExternalIsbns: [],
        externalProviderBreakdown: {},
        ndlRequestUrlWithoutSecrets: [],
        ndlHttpStatus: [],
        ndlResponseContentType: [],
        ndlResponseTextSample: "",
        ndlItemCountBeforeParse: 0,
        ndlParsedItemCount: 0,
        ndlIdentifierSamples: [],
        calilChunks: [],
        externalCandidatesBeforeLimitCount: 0,
        externalCandidatesAfterLimitCount: 0,
        externalLimit,
        externalDroppedByLimitCount: 0,
        sampleExternalTitlesBeforeLimit: [],
        sampleExternalTitlesAfterLimit: [],
        sampleDroppedExternalTitles: [],
      };
      return NextResponse.json({
        textnextResults: [],
        externalResults: [],
        textnext: [],
        suggestions: [],
        errors,
        debug: includeDebug ? debug : undefined,
        fetchedAt: new Date().toISOString(),
      });
    }

    const textnextIsbns = groupedTextnextBooks.map((book) => String(book.isbn));
    let externalCandidates: ExternalBookCandidate[] = [];
    let googleBooksRawCount = 0;
    let googleBooksWithIsbnCount = 0;
    let ndlRawCount = 0;
    let ndlWithIsbnCount = 0;
    let ndlDebug: NdlProviderDebug | undefined;
    const externalProviderBreakdown: LibrarySearchDebug["externalProviderBreakdown"] = {};
    if (mode === "keyword" && query.length > 2) {
      for (const provider of bookSearchProviders) {
        try {
          const result = await provider(query, noCache);
          externalProviderBreakdown[result.provider] = {
            rawCount: result.rawCount,
            withIsbnCount: result.withIsbnCount,
            candidateCount: result.candidates.length,
          };
          if (result.provider === "google_books") {
            googleBooksRawCount += result.rawCount;
            googleBooksWithIsbnCount += result.withIsbnCount;
          }
          if (result.provider === "ndl") {
            ndlRawCount += result.rawCount;
            ndlWithIsbnCount += result.withIsbnCount;
            ndlDebug = result.debug;
          }
          externalCandidates = [...externalCandidates, ...result.candidates];
        } catch (err: any) {
          console.warn("Book search provider failed:", err);
          errors.push({
            source: provider.name === "searchNdlBooks" ? "ndl" : "google_books",
            message: err.message || "Book search request failed",
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
    const externalCandidatesBeforeLimit = [...externalCandidates];

    const externalIsbns = externalCandidates
      .map((book) => book.isbn)
      .filter((isbn) => !textnextIsbns.includes(isbn))
      .slice(0, externalLimit);
    const externalIsbnSet = new Set(externalIsbns);
    const externalCandidatesAfterLimit = externalCandidates.filter((book) => externalIsbnSet.has(book.isbn));
    const droppedExternalCandidates = externalCandidates.filter((book) => !externalIsbnSet.has(book.isbn) && !textnextIsbns.includes(book.isbn));

    const fetchedAt = new Date().toISOString();
    let textnextCalilLookup: CalilLookupResult = {
      books: new Map<string, any>(),
      continueCount: 0,
      completed: true,
      libkeysSeen: [],
      rawStatusesSample: [],
    };
    let externalCalilLookup: CalilLookupResult = {
      books: new Map<string, any>(),
      continueCount: 0,
      completed: true,
      libkeysSeen: [],
      rawStatusesSample: [],
    };
    let textnextCalilChunks: CalilChunkDebug[] = [];
    let externalCalilChunks: CalilChunkDebug[] = [];
    try {
      const result = await fetchCalilAvailabilityInChunks(textnextIsbns, 5, "textnext", noCache);
      textnextCalilLookup = result.lookup;
      textnextCalilChunks = result.chunks;
      if (!textnextCalilLookup.completed) {
        errors.push({
          source: "calil",
          message: "Calil lookup for TextNext books did not complete before timeout",
        });
      }
    } catch (err: any) {
      console.error("Calil TextNext lookup failed:", err);
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

    try {
      const result = await fetchCalilAvailabilityInChunks(externalIsbns, 3, "external", noCache);
      externalCalilLookup = result.lookup;
      externalCalilChunks = result.chunks;
      if (!externalCalilLookup.completed) {
        errors.push({
          source: "calil",
          message: "Calil lookup for external candidates did not complete before timeout",
        });
      }
    } catch (err: any) {
      console.error("Calil external lookup failed:", err);
      errors.push({
        source: "calil",
        message: err.message || "Calil external request failed",
      });
    }

    const textnextResults = groupedTextnextBooks
      .map((book) => {
        const result = toTextnextLibraryBook(book, textnextCalilLookup.books.get(String(book.isbn)), fetchedAt);
        if (!result) return null;
        const grouped = textnextBooksByIsbn.get(result.isbn) || [];
        return {
          ...result,
          itemIds: grouped.map((item) => item.id).filter(Boolean) as string[],
          textnextItemCount: grouped.length,
        };
      })
      .filter(Boolean) as LibraryBook[];

    const externalResults = externalCandidates
      .filter((book) => externalIsbns.includes(book.isbn))
      .map((book) => toExternalLibraryBook(book, externalCalilLookup.books.get(book.isbn), fetchedAt))
      .filter((book): book is LibraryBook => Boolean(book))
      .slice(0, 8);

    const textnextCalilHitCount = textnextResults.filter((book) => book.hasHolding).length;
    const mergedCalilLookup = mergeCalilLookups([textnextCalilLookup, externalCalilLookup]);
    const calilChunks: CalilChunkDebug[] = [...textnextCalilChunks, ...externalCalilChunks];
    const debug: LibrarySearchDebug = {
      query,
      mode,
      systemId,
      textnextIsbnCount: textnextIsbns.length,
      googleBooksRawCount,
      googleBooksWithIsbnCount,
      ndlRawCount,
      ndlWithIsbnCount,
      externalIsbnCount: externalIsbns.length,
      externalCalilCheckedCount: externalIsbns.length,
      textnextCalilHitCount,
      externalCalilHitCount: externalResults.length,
      calilContinueCount: mergedCalilLookup.continueCount,
      calilCompleted: mergedCalilLookup.completed,
      calilLibkeysSeen: mergedCalilLookup.libkeysSeen,
      calilRawStatusesSample: mergedCalilLookup.rawStatusesSample,
      sampleExternalTitles: externalCandidates.slice(0, 5).map((book) => book.title),
      sampleExternalIsbns: externalIsbns.slice(0, 8),
      externalProviderBreakdown,
      ndlRequestUrlWithoutSecrets: ndlDebug?.requestUrlWithoutSecrets,
      ndlHttpStatus: ndlDebug?.httpStatus,
      ndlResponseContentType: ndlDebug?.responseContentType,
      ndlResponseTextSample: ndlDebug?.responseTextSample,
      ndlItemCountBeforeParse: ndlDebug?.itemCountBeforeParse,
      ndlParsedItemCount: ndlDebug?.parsedItemCount,
      ndlIdentifierSamples: ndlDebug?.identifierSamples,
      ndlError: ndlDebug?.error,
      calilChunks,
      externalCandidatesBeforeLimitCount: externalCandidatesBeforeLimit.length,
      externalCandidatesAfterLimitCount: externalCandidatesAfterLimit.length,
      externalLimit,
      externalDroppedByLimitCount: droppedExternalCandidates.length,
      sampleExternalTitlesBeforeLimit: externalCandidatesBeforeLimit.slice(0, 8).map((book) => book.title),
      sampleExternalTitlesAfterLimit: externalCandidatesAfterLimit.slice(0, 8).map((book) => book.title),
      sampleDroppedExternalTitles: droppedExternalCandidates.slice(0, 8).map((book) => book.title),
    };

    console.log("[library-search]", debug);
    if (includeDebug) {
      for (const sample of mergedCalilLookup.rawStatusesSample) {
        console.log("[calil-raw-status]", {
          isbn: sample.isbn,
          libkeys: Object.keys(sample.statuses),
          statuses: sample.statuses,
        });
      }
      console.log("[calil-request-isbns]", { textnextIsbns, externalIsbns });
    }

    return NextResponse.json({
      textnextResults,
      externalResults,
      errors,
      debug: includeDebug ? debug : undefined,
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

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  return handleLibrarySearch(request, body);
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") || request.nextUrl.searchParams.get("query") || "";
  const mode = request.nextUrl.searchParams.get("mode") === "selected_item" ? "selected_item" : "keyword";
  return handleLibrarySearch(request, {
    query,
    mode,
    textnextBooks: [],
  });
}
