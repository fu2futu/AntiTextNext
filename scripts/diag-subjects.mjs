// 分野分類のカバレッジ診断（秘密情報は出力しない）
// node scripts/diag-subjects.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// .env を手動パース
const env = {};
for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const apiUrl = env.ISCT_SUBJECTS_API_URL;
const apiKey = env.ISCT_SUBJECTS_API_KEY;
const ISBN_RE = /^97[89][0-9]{10}$/;

const sb = createClient(url, key, { auth: { persistSession: false } });

const { data, error } = await sb
  .from("items")
  .select("isbn, status")
  .in("status", ["available", "trading"]);
if (error) {
  console.error("items query error:", error.message);
  process.exit(1);
}

const total = data.length;
const withIsbnRaw = data.filter((r) => r.isbn);
const validIsbns = Array.from(
  new Set(withIsbnRaw.map((r) => r.isbn).filter((x) => ISBN_RE.test(x)))
);

console.log("=== 出品(available/trading) ===");
console.log("総数:", total);
console.log("ISBNあり(非null):", withIsbnRaw.length);
console.log("有効な13桁ISBN(distinct):", validIsbns.length);

if (validIsbns.length === 0) {
  console.log("\n→ ISBN付き出品が無いため分類できません（バーコード出品のみ分類対象）");
  process.exit(0);
}

// isct に問い合わせ
const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
const subjects = {};
let apiErr = null;
for (const part of chunk(validIsbns, 200)) {
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify({ isbns: part }),
  });
  if (!res.ok) { apiErr = `${res.status} ${await res.text().catch(() => "")}`; break; }
  const json = await res.json();
  Object.assign(subjects, json.subjects || {});
}

if (apiErr) {
  console.log("\nisct API エラー:", apiErr);
  process.exit(1);
}

const classified = Object.keys(subjects);
console.log("\n=== isct 分類結果 ===");
console.log("分類できたISBN:", classified.length, "/", validIsbns.length);

// 学院/系ごとの集計
const bySchool = {};
const byDept = {};
for (const isbn of classified) {
  for (const s of subjects[isbn]) {
    bySchool[s.school] = (bySchool[s.school] || 0) + 1;
    const k = `${s.school} / ${s.dept_label}`;
    byDept[k] = (byDept[k] || 0) + 1;
  }
}
console.log("\n学院別(ISBN数):");
for (const [k, v] of Object.entries(bySchool).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
console.log("\n系別(ISBN数):");
for (const [k, v] of Object.entries(byDept).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);

// 分類できなかったISBNの例
const missed = validIsbns.filter((i) => !subjects[i]).slice(0, 15);
console.log("\n分類できなかったISBN例(最大15):");
for (const i of missed) console.log("  " + i);
