import Image from "next/image";
import Link from "next/link";
import { AdminPageHeader, StatusBadge } from "../_components/admin-shell";
import { formatAdminDate, getStringParam, maskEmail, requireAdmin, type AdminSearchParams } from "@/lib/admin-utils";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage({ searchParams }: { searchParams: AdminSearchParams }) {
  const { supabase } = await requireAdmin();
  const q = getStringParam(searchParams, "q");
  const restriction = getStringParam(searchParams, "restriction");
  const gradeFilter = getStringParam(searchParams, "grade");
  const departmentFilter = getStringParam(searchParams, "department");

  // ─── Fetch all profiles for stats (lightweight: grade + department only) ───
  const { data: allProfiles } = await supabase
    .from("profiles")
    .select("grade, department");

  const allProfilesList = (allProfiles ?? []) as { grade: number | null; department: string | null }[];
  const totalCount = allProfilesList.length;

  // Grade breakdown
  const gradeCounts = new Map<string, number>();
  for (const p of allProfilesList) {
    const key = p.grade != null ? `${p.grade}年` : "未設定";
    gradeCounts.set(key, (gradeCounts.get(key) ?? 0) + 1);
  }
  const gradeOrder = ["1年", "2年", "3年", "4年", "未設定"];
  const sortedGradeCounts = gradeOrder
    .filter((k) => gradeCounts.has(k))
    .map((k) => ({ label: k, count: gradeCounts.get(k)! }));

  // Department breakdown
  const deptCounts = new Map<string, number>();
  for (const p of allProfilesList) {
    const key = p.department || "未設定";
    deptCounts.set(key, (deptCounts.get(key) ?? 0) + 1);
  }
  const sortedDeptCounts = [...deptCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({ label, count }));

  // Unique departments for filter dropdown
  const uniqueDepartments = [...deptCounts.keys()].filter((d) => d !== "未設定").sort();

  // ─── Fetch user list (with RPC or fallback) ───
  const { data, error } = await (supabase as any).rpc("admin_list_users", {
    search_text: q || null,
    ban_filter: restriction || null,
  });

  let users = (data ?? []) as any[];
  let pageError = error?.message ?? "";

  if (error) {
    let fallbackQuery = supabase
      .from("profiles")
      .select("user_id, nickname, avatar_url, department, degree, grade, major, created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (q) {
      fallbackQuery = fallbackQuery.or(`nickname.ilike.%${q}%,department.ilike.%${q}%,degree.ilike.%${q}%,major.ilike.%${q}%,user_id.ilike.%${q}%`);
    }

    const fallback = await fallbackQuery;
    if (!fallback.error) {
      users = ((fallback.data ?? []) as any[]).map((profile) => ({
        ...profile,
        masked_email: maskEmail(null),
        last_sign_in_at: null,
        transaction_count: "-",
        report_count: "-",
        restriction_status: "unknown",
      }));
      pageError = "admin_list_users RPC が未適用のため、メール・最終ログイン・通報/制限集計なしの fallback 表示です。migration を適用してください。";
    }
  }

  // Apply grade filter (client-side, since RPC doesn't support it)
  if (gradeFilter) {
    if (gradeFilter === "unset") {
      users = users.filter((u) => u.grade == null);
    } else {
      const gradeNum = parseInt(gradeFilter, 10);
      if (!isNaN(gradeNum)) {
        users = users.filter((u) => u.grade === gradeNum);
      }
    }
  }

  // Apply department filter (client-side)
  if (departmentFilter) {
    users = users.filter((u) => u.department === departmentFilter);
  }

  return (
    <>
      <AdminPageHeader title="ユーザー管理" description="個人情報は初期状態でマスキングしています。全文表示は詳細画面から理由付きで記録されます。" />
      <main className="space-y-5 p-6">

        {/* ─── Stats Summary ─── */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-baseline gap-3">
            <h2 className="text-lg font-black">登録者統計</h2>
            <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-black text-blue-700">
              総登録者数: {totalCount.toLocaleString()}人
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {/* Grade breakdown */}
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <h3 className="mb-3 text-xs font-black uppercase text-slate-500">学年別</h3>
              <div className="flex flex-wrap gap-2">
                {sortedGradeCounts.map(({ label, count }) => (
                  <div key={label} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <span className="text-sm font-black text-slate-700">{label}</span>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-black text-primary">{count}人</span>
                  </div>
                ))}
              </div>
            </div>
            {/* Department breakdown */}
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <h3 className="mb-3 text-xs font-black uppercase text-slate-500">学院別</h3>
              <div className="flex flex-wrap gap-2">
                {sortedDeptCounts.map(({ label, count }) => (
                  <div key={label} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <span className="text-sm font-black text-slate-700">{label}</span>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-black text-primary">{count}人</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ─── Filters ─── */}
        <form className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[1fr_140px_140px_140px_auto]">
          <input name="q" defaultValue={q} placeholder="ユーザーネーム・メール・ID・学院・課程・学年・系で検索" className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold" />
          <select name="grade" defaultValue={gradeFilter} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold">
            <option value="">全学年</option>
            <option value="1">1年</option>
            <option value="2">2年</option>
            <option value="3">3年</option>
            <option value="4">4年</option>
            <option value="unset">未設定</option>
          </select>
          <select name="department" defaultValue={departmentFilter} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold">
            <option value="">全学院</option>
            {uniqueDepartments.map((dept) => (
              <option key={dept} value={dept}>{dept}</option>
            ))}
          </select>
          <select name="restriction" defaultValue={restriction} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold">
            <option value="">すべて</option>
            <option value="restricted">BAN/制限中</option>
            <option value="none">制限なし</option>
          </select>
          <button className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-black text-white">検索</button>
        </form>

        {pageError && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">{pageError}</div>}

        {/* ─── User Table ─── */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-black text-slate-500">
            {users.length.toLocaleString()}件表示
          </div>
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-black uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">ユーザー</th>
                <th className="px-4 py-3">学院・課程・学年・系</th>
                <th className="px-4 py-3">大学メール</th>
                <th className="px-4 py-3">登録日</th>
                <th className="px-4 py-3">最終ログイン</th>
                <th className="px-4 py-3">取引</th>
                <th className="px-4 py-3">通報</th>
                <th className="px-4 py-3">状態</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user) => (
                <tr key={user.user_id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/admin/users/${user.user_id}`} title={`管理ID: ${user.user_id}`} className="flex items-center gap-3 font-black text-slate-900 hover:text-primary">
                      <Avatar src={user.avatar_url} alt={user.nickname} />
                      <span>{user.nickname}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-bold text-slate-600">{[user.department, user.degree, user.grade ? `${user.grade}年` : null, user.major].filter(Boolean).join(" / ")}</td>
                  <td className="px-4 py-3 font-mono text-xs font-bold text-slate-600">{user.masked_email}</td>
                  <td className="px-4 py-3 font-bold text-slate-600">{formatAdminDate(user.created_at)}</td>
                  <td className="px-4 py-3 font-bold text-slate-600">{formatAdminDate(user.last_sign_in_at)}</td>
                  <td className="px-4 py-3 font-black">{user.transaction_count}</td>
                  <td className="px-4 py-3 font-black">{user.report_count}</td>
                  <td className="px-4 py-3"><StatusBadge value={user.restriction_status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && <div className="p-10 text-center text-sm font-bold text-slate-500">該当するユーザーがいません</div>}
        </div>
      </main>
    </>
  );
}

function Avatar({ src, alt }: { src?: string | null; alt: string }) {
  if (!src) return <div className="h-10 w-10 rounded-full bg-slate-200" />;
  return <Image src={src} alt={alt} width={40} height={40} className="h-10 w-10 rounded-full object-cover" />;
}
