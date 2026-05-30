// Shared encoding for handing a list of textbooks (ISBN + title) between apps
// (e.g. the isct campus app links to /textbooks?d=<base64url>).
// The same encode/decode pair must be mirrored on the sender side.

export type SharedBook = { isbn: string; title: string };

const ISBN13_RE = /^97[89]\d{10}$/;

/** Keep only a clean 13-digit ISBN (978/979), else null. */
export function normalizeIsbn13(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/[^0-9]/g, "");
  return ISBN13_RE.test(digits) ? digits : null;
}

/** base64url-encode a UTF-8 string (handles Japanese titles). */
export function encodeBooksParam(books: SharedBook[]): string {
  const compact = books.map((b) => ({ i: b.isbn, t: b.title }));
  const json = JSON.stringify(compact);
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Inverse of encodeBooksParam. Returns [] on malformed input. */
export function decodeBooksParam(d: string | null | undefined): SharedBook[] {
  if (!d) return [];
  try {
    let b64 = d.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    const seen = new Set<string>();
    const out: SharedBook[] = [];
    for (const o of arr) {
      const isbn = normalizeIsbn13(typeof o?.i === "string" ? o.i : "");
      if (!isbn || seen.has(isbn)) continue;
      seen.add(isbn);
      out.push({ isbn, title: typeof o?.t === "string" ? o.t : "" });
    }
    return out;
  } catch {
    return [];
  }
}
