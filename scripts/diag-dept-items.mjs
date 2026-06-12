// 指定した系(dept_label)に分類される出品中アイテムを一覧する
// node scripts/diag-dept-items.mjs "理工系教養科目"
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const target = process.argv[2] || "理工系教養科目";

const env = {};
for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const ISBN_RE = /^97[89][0-9]{10}$/;

const { data: items } = await sb
  .from("items")
  .select("id, title, selling_price, status, isbn")
  .in("status", ["available", "trading"]);

const valid = items.filter((i) => i.isbn && ISBN_RE.test(i.isbn));
const isbns = Array.from(new Set(valid.map((i) => i.isbn)));

// isct で分類
const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
const subjects = {};
for (const part of chunk(isbns, 200)) {
  const res = await fetch(env.ISCT_SUBJECTS_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": env.ISCT_SUBJECTS_API_KEY },
    body: JSON.stringify({ isbns: part }),
  });
  if (!res.ok) { console.error("API err", res.status); process.exit(1); }
  Object.assign(subjects, (await res.json()).subjects || {});
}

// target に該当する ISBN
const targetIsbns = new Set(
  isbns.filter((isbn) => (subjects[isbn] || []).some((s) => s.dept_label === target))
);

const matched = valid.filter((i) => targetIsbns.has(i.isbn));
console.log(`=== 「${target}」に分類される出品中アイテム: ${matched.length}件 ===`);
for (const i of matched) {
  console.log(`- ${i.title}  ¥${i.selling_price}  [${i.status}]  ISBN:${i.isbn}`);
}
