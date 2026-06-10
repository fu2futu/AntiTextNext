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
  ndlBooksRawCount?: number;
  ndlFilteredOutArticleCount?: number;
  ndlFilteredOutPeriodicalCount?: number;
  ndlFilteredOutSamples?: string[];
  ndlMediatypeSamples?: string[];
  ndlDpidSamples?: string[];
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
  totalElapsedMs?: number;
  providerElapsedMs?: Record<string, number>;
  calilElapsedMs?: number;
  chunkElapsedMs?: number[];
  calilConcurrency?: number;
  externalBatchLimit?: number;
  externalTotalLookupLimit?: number;
  externalDisplayLimit?: number;
  externalOffset?: number;
  externalCheckedCount?: number;
  externalTotalCount?: number;
  externalHasMore?: boolean;
  returnedDueToTimeBudget?: boolean;
  pendingChunkCount?: number;
  candidateScoringSamples?: Array<{
    title: string;
    isbn: string;
    providers?: string[];
    score?: number;
    looksLikeArticle?: boolean;
    titleIncludesQuery?: boolean;
  }>;
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
const MAX_DEBUG_EXTERNAL_LIMIT = 63;
const EXTERNAL_TOTAL_LOOKUP_LIMIT = 63;
const EXTERNAL_BATCH_LIMIT = 9;
const EXTERNAL_DISPLAY_LIMIT = 8;
const CALIL_CHUNK_SIZE = 3;
const CALIL_CONCURRENCY = 3;
const EXTERNAL_BATCH_TIME_BUDGET_MS = 8000;

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
  noCache = false,
  concurrency = CALIL_CONCURRENCY,
  timeBudgetMs?: number
) {
  const normalized = unique(isbns.map(normalizeIsbn).filter(isValidIsbn));
  const chunkList: string[][] = [];
  for (let index = 0; index < normalized.length; index += chunkSize) {
    chunkList.push(normalized.slice(index, index + chunkSize));
  }

  const lookups: CalilLookupResult[] = [];
  const chunks: CalilChunkDebug[] = [];
  const chunkElapsedMs: number[] = [];
  const startedAt = Date.now();
  let nextIndex = 0;
  let returnedDueToTimeBudget = false;

  async function runOne(chunk: string[]) {
    const chunkStartedAt = Date.now();
    const lookup = await fetchCalilAvailability(chunk, noCache);
    chunkElapsedMs.push(Date.now() - chunkStartedAt);
    lookups.push(lookup);
    chunks.push({
      type,
      isbnCount: chunk.length,
      completed: lookup.completed,
      continueCount: lookup.continueCount,
      hitCount: Array.from(lookup.books.values()).filter((result) => normalizeLibraryStatuses(result).hasHolding).length,
    });
  }

  while (nextIndex < chunkList.length) {
    if (timeBudgetMs && Date.now() - startedAt >= timeBudgetMs) {
      returnedDueToTimeBudget = true;
      break;
    }
    const wave = chunkList.slice(nextIndex, nextIndex + concurrency);
    nextIndex += wave.length;
    await Promise.all(wave.map(runOne));
  }

  const pendingChunkCount = Math.max(0, chunkList.length - nextIndex);
  return {
    lookup: mergeCalilLookups(lookups),
    chunks,
    chunkElapsedMs,
    returnedDueToTimeBudget,
    pendingChunkCount,
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
  providers?: Array<"google_books" | "ndl">;
  searchKinds?: string[];
  title: string;
  isbn: string;
  authors?: string[];
  publisher?: string | null;
  publishedDate?: string | null;
  imageUrl?: string | null;
  mediaType?: string | null;
  dpid?: string | null;
  link?: string | null;
  identifierSamples?: string[];
  looksLikeArticle?: boolean;
  looksLikePeriodical?: boolean;
  score?: number;
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
  booksRawCount: number;
  filteredOutArticleCount: number;
  filteredOutPeriodicalCount: number;
  filteredOutSamples: string[];
  mediatypeSamples: string[];
  dpidSamples: string[];
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
        providers: ["google_books"],
        searchKinds: [googleQuery.startsWith("intitle:") ? "google_intitle" : "google_query"],
        title: info.title,
        isbn,
        authors: Array.isArray(info.authors) ? info.authors.slice(0, 3) : [],
        publisher: info.publisher || null,
        publishedDate: info.publishedDate || null,
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

const getXmlLocalTagAttributeValues = (xml: string, localName: string, attributeName: string) => {
  const escapedLocalName = localName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedAttributeName = attributeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `<(?:[\\w.-]+:)?${escapedLocalName}\\b[^>]*\\s${escapedAttributeName}=["']([^"']+)["'][^>]*>`,
    "gi"
  );
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
        booksRawCount: 0,
        filteredOutArticleCount: 0,
        filteredOutPeriodicalCount: 0,
        filteredOutSamples: [],
        mediatypeSamples: [],
        dpidSamples: [],
      },
    };
  }

  const cacheKey = trimmed.toLowerCase();
  const cached = ndlCache.get(cacheKey);
  if (!noCache && cached && cached.expiresAt > Date.now()) return cached.value;

  const requests = [
    (() => {
      const url = new URL("https://ndlsearch.ndl.go.jp/api/opensearch");
      url.searchParams.set("title", trimmed);
      url.searchParams.set("cnt", "30");
      url.searchParams.set("mediatype", "books");
      return { url, kind: "ndl_title_books" };
    })(),
    (() => {
      const url = new URL("https://ndlsearch.ndl.go.jp/api/opensearch");
      url.searchParams.set("any", trimmed);
      url.searchParams.set("cnt", "30");
      url.searchParams.set("mediatype", "books");
      return { url, kind: "ndl_any_books" };
    })(),
    (() => {
      const url = new URL("https://ndlsearch.ndl.go.jp/api/opensearch");
      url.searchParams.set("any", trimmed);
      url.searchParams.set("cnt", "30");
      url.searchParams.set("mediatype", "books");
      url.searchParams.set("dpid", "iss-ndl-opac-bib");
      return { url, kind: "ndl_any_books_opac" };
    })(),
  ];

  const records: Array<{ xml: string; kind: string }> = [];
  const identifierSamples = new Set<string>();
  const mediatypeSamples = new Set<string>();
  const dpidSamples = new Set<string>();
  const debug: NdlProviderDebug = {
    requestUrlWithoutSecrets: requests.map((request) => request.url.toString()),
    httpStatus: [],
    responseContentType: [],
    responseTextSample: "",
    itemCountBeforeParse: 0,
    parsedItemCount: 0,
    identifierSamples: [],
    booksRawCount: 0,
    filteredOutArticleCount: 0,
    filteredOutPeriodicalCount: 0,
    filteredOutSamples: [],
    mediatypeSamples: [],
    dpidSamples: [],
  };

  for (const request of requests) {
    const { url, kind } = request;
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
    records.push(...getXmlRecords(xml).map((record) => ({ xml: record, kind })));
  }

  debug.itemCountBeforeParse = records.length;
  debug.booksRawCount = records.length;
  const seen = new Set<string>();
  const candidates: ExternalBookCandidate[] = [];
  let withIsbnCount = 0;
  let filteredOutArticleCount = 0;
  let filteredOutPeriodicalCount = 0;
  const filteredOutSamples = new Set<string>();

  for (const record of records) {
    const itemXml = record.xml;
    const title = getXmlLocalTagValues(itemXml, "title")[0] || getXmlTagValues(itemXml, "dc:title")[0];
    const links = unique([
      ...getXmlLocalTagValues(itemXml, "link"),
      ...getXmlTagValues(itemXml, "link"),
      ...getXmlLocalTagAttributeValues(itemXml, "link", "href"),
    ]);
    const mediaTypes = unique([
      ...getXmlLocalTagValues(itemXml, "mediaType"),
      ...getXmlLocalTagValues(itemXml, "mediatype"),
      ...getXmlLocalTagValues(itemXml, "materialType"),
      ...getXmlLocalTagValues(itemXml, "type"),
    ]);
    const dpids = unique([
      ...getXmlLocalTagValues(itemXml, "dpid"),
      ...getXmlLocalTagValues(itemXml, "databaseId"),
    ]);
    mediaTypes.slice(0, 4).forEach((value) => mediatypeSamples.add(value.slice(0, 120)));
    dpids.slice(0, 4).forEach((value) => dpidSamples.add(value.slice(0, 120)));

    const identifiers = [
      ...getXmlLocalTagValues(itemXml, "identifier"),
      ...getXmlTagValues(itemXml, "dc:identifier"),
      ...getXmlTagValues(itemXml, "dcndl:isbn"),
      ...getXmlTagValues(itemXml, "prism:isbn"),
      ...getXmlLocalTagValues(itemXml, "isbn"),
      ...getXmlTagValues(itemXml, "guid"),
      ...links,
      itemXml,
    ];
    for (const value of identifiers.slice(0, 4)) {
      if (value) identifierSamples.add(value.slice(0, 160));
    }

    const combinedForFiltering = [
      itemXml,
      title || "",
      ...identifiers,
      ...links,
      ...mediaTypes,
      ...dpids,
    ].join("\n");
    const looksLikeArticle = /(?:R000000004|R100000004|mediatype\/articles|\/articles\b|雑誌記事|論文|紀要論文|学位論文|巻号)/i.test(combinedForFiltering);
    const looksLikePeriodical = /(?:mediatype\/periodicals|\/periodicals\b|逐次刊行物|雑誌|新聞|巻号)/i.test(combinedForFiltering);
    if (looksLikeArticle || looksLikePeriodical) {
      if (looksLikeArticle) filteredOutArticleCount += 1;
      if (looksLikePeriodical) filteredOutPeriodicalCount += 1;
      if (filteredOutSamples.size < 8) {
        filteredOutSamples.add((title || identifiers[0] || combinedForFiltering).slice(0, 180));
      }
      continue;
    }

    const normalizedIsbns = extractIsbnsFromValues(identifiers);
    const isbn = normalizedIsbns.find(isIsbn13) || normalizedIsbns.find(isIsbn10);
    if (!isbn) continue;
    withIsbnCount += 1;
    if (seen.has(isbn)) continue;
    seen.add(isbn);

    if (!title) continue;
    const authors = unique([
      ...getXmlLocalTagValues(itemXml, "author"),
      ...getXmlTagValues(itemXml, "dc:creator"),
      ...getXmlLocalTagValues(itemXml, "creator"),
    ]).slice(0, 3);

    candidates.push({
      provider: "ndl",
      providers: ["ndl"],
      searchKinds: [record.kind],
      title,
      isbn,
      authors,
      publisher: getXmlTagValues(itemXml, "dc:publisher")[0] || getXmlLocalTagValues(itemXml, "publisher")[0] || null,
      publishedDate: getXmlTagValues(itemXml, "dc:date")[0] || getXmlLocalTagValues(itemXml, "date")[0] || null,
      imageUrl: null,
      mediaType: mediaTypes[0] || null,
      dpid: dpids[0] || null,
      link: links[0] || null,
      identifierSamples: identifiers.slice(0, 3),
      looksLikeArticle,
      looksLikePeriodical,
    });

    if (candidates.length >= 20) break;
  }
  debug.parsedItemCount = candidates.length;
  debug.identifierSamples = Array.from(identifierSamples).slice(0, 8);
  debug.filteredOutArticleCount = filteredOutArticleCount;
  debug.filteredOutPeriodicalCount = filteredOutPeriodicalCount;
  debug.filteredOutSamples = Array.from(filteredOutSamples).slice(0, 8);
  debug.mediatypeSamples = Array.from(mediatypeSamples).slice(0, 8);
  debug.dpidSamples = Array.from(dpidSamples).slice(0, 8);

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

function mergeExternalCandidate(existing: ExternalBookCandidate, next: ExternalBookCandidate): ExternalBookCandidate {
  return {
    ...existing,
    providers: unique([...(existing.providers || [existing.provider]), ...(next.providers || [next.provider])]),
    searchKinds: unique([...(existing.searchKinds || []), ...(next.searchKinds || [])]),
    authors: existing.authors?.length ? existing.authors : next.authors,
    publisher: existing.publisher || next.publisher || null,
    publishedDate: existing.publishedDate || next.publishedDate || null,
    imageUrl: existing.imageUrl || next.imageUrl || null,
    mediaType: existing.mediaType || next.mediaType || null,
    dpid: existing.dpid || next.dpid || null,
    link: existing.link || next.link || null,
    identifierSamples: unique([...(existing.identifierSamples || []), ...(next.identifierSamples || [])]).slice(0, 5),
    looksLikeArticle: Boolean(existing.looksLikeArticle || next.looksLikeArticle),
    looksLikePeriodical: Boolean(existing.looksLikePeriodical || next.looksLikePeriodical),
  };
}

function scoreExternalCandidate(candidate: ExternalBookCandidate, query: string): ExternalBookCandidate {
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedTitle = candidate.title.toLowerCase();
  const titleIncludesQuery = normalizedQuery.length > 0 && normalizedTitle.includes(normalizedQuery);
  const providers = candidate.providers || [candidate.provider];
  const searchKinds = candidate.searchKinds || [];
  const looksLikeArticle = Boolean(candidate.looksLikeArticle);
  const looksLikePeriodical = Boolean(candidate.looksLikePeriodical);
  let score = 0;

  if (titleIncludesQuery) score += 100;
  if (searchKinds.some((kind) => kind.startsWith("ndl_title"))) score += 50;
  if (searchKinds.includes("ndl_any_books_opac")) score += 15;
  if (providers.length > 1) score += 30;
  if (isIsbn13(candidate.isbn)) score += 20;
  if (candidate.publisher) score += 10;
  if (candidate.publishedDate) score += 5;
  if (candidate.authors?.length) score += 5;
  if (!titleIncludesQuery) score -= 20;
  if (looksLikeArticle) score -= 100;
  if (looksLikePeriodical) score -= 80;

  return {
    ...candidate,
    providers,
    searchKinds,
    looksLikeArticle,
    looksLikePeriodical,
    score,
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
    const bodyExternalOffset = Number(body.externalOffset ?? request.nextUrl.searchParams.get("externalOffset") ?? "");
    const bodyExternalLimit = Number(body.externalLimit ?? request.nextUrl.searchParams.get("externalLimit") ?? "");
    const bodyExternalTotalLimit = Number(body.externalTotalLimit ?? request.nextUrl.searchParams.get("externalTotalLimit") ?? "");
    const externalOffset = Number.isFinite(bodyExternalOffset) && bodyExternalOffset > 0 ? Math.floor(bodyExternalOffset) : 0;
    const externalLimit = Number.isFinite(bodyExternalLimit) && bodyExternalLimit > 0
      ? Math.min(Math.floor(bodyExternalLimit), includeDebug ? MAX_DEBUG_EXTERNAL_LIMIT : EXTERNAL_BATCH_LIMIT)
      : (includeDebug && Number.isFinite(requestedExternalLimit) && requestedExternalLimit > 0
        ? Math.min(Math.floor(requestedExternalLimit), MAX_DEBUG_EXTERNAL_LIMIT)
        : EXTERNAL_BATCH_LIMIT);
    const externalTotalLimit = Number.isFinite(bodyExternalTotalLimit) && bodyExternalTotalLimit > 0
      ? Math.min(Math.floor(bodyExternalTotalLimit), includeDebug ? MAX_DEBUG_EXTERNAL_LIMIT : EXTERNAL_TOTAL_LOOKUP_LIMIT)
      : EXTERNAL_TOTAL_LOOKUP_LIMIT;
    const startedAt = Date.now();
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
        ndlBooksRawCount: 0,
        ndlFilteredOutArticleCount: 0,
        ndlFilteredOutPeriodicalCount: 0,
        ndlFilteredOutSamples: [],
        ndlMediatypeSamples: [],
        ndlDpidSamples: [],
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
    const providerElapsedMs: Record<string, number> = {};
    const externalProviderBreakdown: LibrarySearchDebug["externalProviderBreakdown"] = {};
    if (mode === "keyword" && query.length > 2) {
      for (const provider of bookSearchProviders) {
        try {
          const providerStartedAt = Date.now();
          const result = await provider(query, noCache);
          providerElapsedMs[result.provider] = Date.now() - providerStartedAt;
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
      const existing = externalByIsbn.get(candidate.isbn);
      if (existing) {
        externalByIsbn.set(candidate.isbn, mergeExternalCandidate(existing, candidate));
      } else {
        externalByIsbn.set(candidate.isbn, candidate);
      }
    }
    externalCandidates = Array.from(externalByIsbn.values())
      .map((candidate) => scoreExternalCandidate(candidate, query))
      .sort((a, b) => (b.score || 0) - (a.score || 0));
    const externalCandidatesBeforeLimit = externalCandidates
      .filter((book) => !textnextIsbns.includes(book.isbn))
      .slice(0, externalTotalLimit);

    const externalBatchCandidates = externalCandidatesBeforeLimit.slice(externalOffset, externalOffset + externalLimit);
    const externalIsbns = externalBatchCandidates
      .map((book) => book.isbn)
      .filter((isbn) => !textnextIsbns.includes(isbn));
    const externalIsbnSet = new Set(externalIsbns);
    const externalCandidatesAfterLimit = externalCandidatesBeforeLimit.filter((book) => externalIsbnSet.has(book.isbn));
    const droppedExternalCandidates = externalCandidatesBeforeLimit.filter((book) => !externalIsbnSet.has(book.isbn));

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
    let chunkElapsedMs: number[] = [];
    let returnedDueToTimeBudget = false;
    let pendingChunkCount = 0;
    let calilElapsedMs = 0;
    try {
      const calilStartedAt = Date.now();
      const result = await fetchCalilAvailabilityInChunks(textnextIsbns, 5, "textnext", noCache, CALIL_CONCURRENCY);
      textnextCalilLookup = result.lookup;
      textnextCalilChunks = result.chunks;
      chunkElapsedMs = [...chunkElapsedMs, ...result.chunkElapsedMs];
      calilElapsedMs += Date.now() - calilStartedAt;
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
      const calilStartedAt = Date.now();
      const result = await fetchCalilAvailabilityInChunks(
        externalIsbns,
        CALIL_CHUNK_SIZE,
        "external",
        noCache,
        CALIL_CONCURRENCY,
        EXTERNAL_BATCH_TIME_BUDGET_MS
      );
      externalCalilLookup = result.lookup;
      externalCalilChunks = result.chunks;
      chunkElapsedMs = [...chunkElapsedMs, ...result.chunkElapsedMs];
      returnedDueToTimeBudget = result.returnedDueToTimeBudget;
      pendingChunkCount = result.pendingChunkCount;
      calilElapsedMs += Date.now() - calilStartedAt;
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

    const externalResults = externalBatchCandidates
      .filter((book) => externalIsbns.includes(book.isbn))
      .map((book) => toExternalLibraryBook(book, externalCalilLookup.books.get(book.isbn), fetchedAt))
      .filter((book): book is LibraryBook => Boolean(book))
      .slice(0, EXTERNAL_DISPLAY_LIMIT);

    const textnextCalilHitCount = textnextResults.filter((book) => book.hasHolding).length;
    const mergedCalilLookup = mergeCalilLookups([textnextCalilLookup, externalCalilLookup]);
    const calilChunks: CalilChunkDebug[] = [...textnextCalilChunks, ...externalCalilChunks];
    const completedExternalIsbnCount = externalCalilChunks.reduce((sum, chunk) => sum + chunk.isbnCount, 0);
    const externalCheckedCount = Math.min(
      externalCandidatesBeforeLimit.length,
      externalOffset + completedExternalIsbnCount
    );
    const externalHasMore = externalCheckedCount < externalCandidatesBeforeLimit.length;
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
      totalElapsedMs: Date.now() - startedAt,
      providerElapsedMs,
      calilElapsedMs,
      chunkElapsedMs,
      calilConcurrency: CALIL_CONCURRENCY,
      externalBatchLimit: externalLimit,
      externalTotalLookupLimit: externalTotalLimit,
      externalDisplayLimit: EXTERNAL_DISPLAY_LIMIT,
      externalOffset,
      externalCheckedCount,
      externalTotalCount: externalCandidatesBeforeLimit.length,
      externalHasMore,
      returnedDueToTimeBudget,
      pendingChunkCount,
      candidateScoringSamples: externalCandidatesBeforeLimit.slice(0, 10).map((book) => ({
        title: book.title,
        isbn: book.isbn,
        providers: book.providers || [book.provider],
        score: book.score,
        looksLikeArticle: book.looksLikeArticle,
        titleIncludesQuery: query.trim().length > 0 && book.title.toLowerCase().includes(query.trim().toLowerCase()),
      })),
      ndlRequestUrlWithoutSecrets: ndlDebug?.requestUrlWithoutSecrets,
      ndlHttpStatus: ndlDebug?.httpStatus,
      ndlResponseContentType: ndlDebug?.responseContentType,
      ndlResponseTextSample: ndlDebug?.responseTextSample,
      ndlItemCountBeforeParse: ndlDebug?.itemCountBeforeParse,
      ndlParsedItemCount: ndlDebug?.parsedItemCount,
      ndlIdentifierSamples: ndlDebug?.identifierSamples,
      ndlBooksRawCount: ndlDebug?.booksRawCount,
      ndlFilteredOutArticleCount: ndlDebug?.filteredOutArticleCount,
      ndlFilteredOutPeriodicalCount: ndlDebug?.filteredOutPeriodicalCount,
      ndlFilteredOutSamples: ndlDebug?.filteredOutSamples,
      ndlMediatypeSamples: ndlDebug?.mediatypeSamples,
      ndlDpidSamples: ndlDebug?.dpidSamples,
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
      progress: {
        externalTotalCount: externalCandidatesBeforeLimit.length,
        externalCheckedCount,
        externalOffset,
        externalLimit,
        externalHasMore,
        externalCompleted: !externalHasMore,
      },
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
