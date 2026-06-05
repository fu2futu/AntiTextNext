import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { isCurrentUserAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

type Subject = { school: string; dept: string; dept_label: string };

const ISBN_RE = /^97[89][0-9]{10}$/;
const BATCH = 200;

const getServiceClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const chunk = <T,>(arr: T[], size: number) => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

/**
 * Sync ISBN -> 学院/系 classification from the isct syllabus DB into book_subjects.
 *
 * Body (POST, optional): { isbns?: string[] }
 *  - With `isbns`: classify just those ISBNs (used on new-listing). Any authenticated user.
 *  - Without `isbns`: full sync of every distinct items.isbn. Admin only.
 */
export async function POST(request: NextRequest) {
  try {
    const apiUrl = process.env.ISCT_SUBJECTS_API_URL;
    const apiKey = process.env.ISCT_SUBJECTS_API_KEY;
    if (!apiUrl || !apiKey) {
      return NextResponse.json({ error: "Subjects API not configured" }, { status: 503 });
    }

    const service = getServiceClient();
    if (!service) {
      return NextResponse.json({ error: "Service role not configured" }, { status: 503 });
    }

    // Auth
    const ssr = createSupabaseServerClient();
    const {
      data: { session },
    } = await ssr.auth.getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({} as { isbns?: unknown }));
    const explicit = Array.isArray(body?.isbns)
      ? Array.from(new Set((body.isbns as unknown[]).filter((x): x is string => typeof x === "string" && ISBN_RE.test(x))))
      : null;

    // Full-catalog sync is admin-only.
    if (!explicit && !(await isCurrentUserAdmin(ssr))) {
      return NextResponse.json({ error: "管理者のみ実行できます" }, { status: 403 });
    }

    // Determine target ISBNs
    let isbns: string[];
    if (explicit) {
      isbns = explicit.slice(0, 50);
    } else {
      const { data, error } = await service
        .from("items")
        .select("isbn")
        .not("isbn", "is", null);
      if (error) {
        return NextResponse.json({ error: "DB error", detail: error.message }, { status: 500 });
      }
      isbns = Array.from(
        new Set(
          (data as { isbn: string | null }[])
            .map((r) => r.isbn)
            .filter((x): x is string => !!x && ISBN_RE.test(x))
        )
      );
    }

    if (isbns.length === 0) {
      return NextResponse.json({ requested: 0, classified: 0, rows: 0, unclassified: 0 });
    }

    // Fetch classifications from isct in batches
    const subjectsByIsbn = new Map<string, Subject[]>();
    for (const part of chunk(isbns, BATCH)) {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify({ isbns: part }),
      });
      if (!res.ok) {
        return NextResponse.json(
          { error: "isct API error", status: res.status, detail: await res.text().catch(() => "") },
          { status: 502 }
        );
      }
      const json = (await res.json()) as { subjects?: Record<string, Subject[]> };
      for (const [isbn, subs] of Object.entries(json.subjects || {})) {
        if (Array.isArray(subs) && subs.length > 0) subjectsByIsbn.set(isbn, subs);
      }
    }

    // Replace rows for the synced ISBNs (delete-then-insert so stale pairs drop off).
    // Only touch ISBNs we actually got an answer for, to avoid wiping on a transient miss.
    const classifiedIsbns = Array.from(subjectsByIsbn.keys());
    let rows = 0;
    if (classifiedIsbns.length > 0) {
      for (const part of chunk(classifiedIsbns, BATCH)) {
        const { error: delErr } = await service.from("book_subjects").delete().in("isbn", part);
        if (delErr) {
          return NextResponse.json({ error: "DB delete error", detail: delErr.message }, { status: 500 });
        }
      }
      const allRows = classifiedIsbns.flatMap((isbn) =>
        subjectsByIsbn.get(isbn)!.map((s) => ({
          isbn,
          school: s.school,
          dept: s.dept,
          dept_label: s.dept_label,
        }))
      );
      for (const part of chunk(allRows, 500)) {
        const { error: insErr } = await service.from("book_subjects").insert(part);
        if (insErr) {
          return NextResponse.json({ error: "DB insert error", detail: insErr.message }, { status: 500 });
        }
        rows += part.length;
      }
    }

    return NextResponse.json({
      requested: isbns.length,
      classified: classifiedIsbns.length,
      rows,
      unclassified: isbns.length - classifiedIsbns.length,
    });
  } catch (err: any) {
    return NextResponse.json({ error: "Internal error", detail: err?.message }, { status: 500 });
  }
}
