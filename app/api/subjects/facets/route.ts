import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// 分野フィルタを「参照型」で提供する。ローカルにテーブルは持たず、呼ばれるたびに
// 出品中(items)のISBNを isct シラバスAPIへ問い合わせて、その場で学院/系ごとにまとめて返す。

type Subject = { school: string; dept: string; dept_label: string };
type Facets = {
  taxonomy: { school: string; depts: { dept: string; dept_label: string }[] }[];
  bySchool: Record<string, string[]>; // school -> isbns
  byDept: Record<string, string[]>; // dept -> isbns
};

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

const addTo = (m: Record<string, Set<string>>, key: string, value: string) => {
  if (!m[key]) m[key] = new Set<string>();
  m[key].add(value);
};

const toArrays = (m: Record<string, Set<string>>) => {
  const out: Record<string, string[]> = {};
  for (const key of Object.keys(m)) out[key] = Array.from(m[key]);
  return out;
};

export async function GET() {
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

    // 出品中のISBNを集める（売れる本の分野だけをチップに出す）
    const { data, error } = await service
      .from("items")
      .select("isbn")
      .in("status", ["available", "trading"])
      .not("isbn", "is", null);
    if (error) {
      return NextResponse.json({ error: "DB error", detail: error.message }, { status: 500 });
    }
    const isbns = Array.from(
      new Set(
        (data as { isbn: string | null }[])
          .map((r) => r.isbn)
          .filter((x): x is string => !!x && ISBN_RE.test(x))
      )
    );

    const bySchool: Record<string, Set<string>> = {};
    const byDept: Record<string, Set<string>> = {};
    const deptLabels: Record<string, string> = {};
    const schoolDepts: Record<string, Set<string>> = {};

    if (isbns.length > 0) {
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
        const entries = Object.entries(json.subjects || {});
        for (const [isbn, subs] of entries) {
          if (!Array.isArray(subs)) continue;
          for (const s of subs) {
            addTo(bySchool, s.school, isbn);
            addTo(byDept, s.dept, isbn);
            deptLabels[s.dept] = s.dept_label;
            addTo(schoolDepts, s.school, s.dept);
          }
        }
      }
    }

    const taxonomy = Object.keys(schoolDepts)
      .sort()
      .map((school) => ({
        school,
        depts: Array.from(schoolDepts[school]).map((dept) => ({
          dept,
          dept_label: deptLabels[dept] || dept,
        })),
      }));

    const out: Facets = { taxonomy, bySchool: toArrays(bySchool), byDept: toArrays(byDept) };
    return NextResponse.json(out);
  } catch (err: any) {
    return NextResponse.json({ error: "Internal error", detail: err?.message }, { status: 500 });
  }
}
