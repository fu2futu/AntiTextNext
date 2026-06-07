import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, BookOpen, MessageCircle } from "lucide-react";
import { requireAdmin } from "@/lib/admin-utils";
import { getItemImageUrl } from "@/lib/image-storage";
import { RewardAvatar } from "@/components/reward-avatar";
import DemoTransactionForm from "./demo-transaction-form";

export const dynamic = "force-dynamic";

export default async function DemoItemPreviewPage({ params }: { params: { id: string } }) {
  const { supabase } = await requireAdmin();
  const { data: item, error } = await (supabase as any)
    .from("items")
    .select("id,title,description,original_price,selling_price,status,seller_id,created_at,front_image_url,back_image_url,front_thumbnail_url,back_thumbnail_url,front_image_storage_path,back_image_storage_path,front_thumbnail_storage_path,back_thumbnail_storage_path,image_storage_provider,transactions(id,status,buyer_id,is_demo),profiles!items_seller_id_fkey_profiles(nickname,avatar_url,department,major)")
    .eq("id", params.id)
    .eq("is_demo", true)
    .maybeSingle();

  if (error || !item) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white p-6">
        <div className="text-center">
          <p className="mb-4 text-sm font-bold text-slate-600">デモ出品が見つかりません</p>
          <Link href="/admin/demo-home" className="font-black text-primary hover:underline">デモホームへ戻る</Link>
        </div>
      </main>
    );
  }

  const profile = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles;
  let avatarUrl = profile?.avatar_url || null;
  if (avatarUrl && !avatarUrl.startsWith("http")) {
    const { data } = supabase.storage.from("avatars").getPublicUrl(avatarUrl);
    avatarUrl = data.publicUrl;
  }

  const frontUrl = getItemImageUrl(item, "front", "detail");
  const backUrl = getItemImageUrl(item, "back", "detail");
  const activeDemoTransaction = (item.transactions ?? []).find((transaction: any) =>
    transaction.is_demo === true &&
    ["requested", "accepted", "scheduling", "scheduled", "awaiting_rating"].includes(transaction.status)
  );
  const images = [
    frontUrl ? { src: frontUrl, label: "表紙" } : null,
    backUrl ? { src: backUrl, label: "裏表紙" } : null,
  ].filter(Boolean) as { src: string; label: string }[];

  return (
    <main className="min-h-screen bg-slate-100 p-4 md:p-8">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-[2rem] bg-white shadow-2xl">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-5 py-4">
          <div className="flex items-center gap-3">
            <Link href="/admin/demo-home" className="rounded-full p-2 text-slate-600 transition hover:bg-slate-100" aria-label="戻る">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-lg font-black text-slate-900">商品詳細</h1>
              <p className="text-[11px] font-bold text-slate-400">スクショ用デモ出品</p>
            </div>
          </div>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">デモ</span>
        </header>

        <div className="grid gap-6 p-5 md:grid-cols-[minmax(0,1fr)_380px] md:p-8">
          <section>
            {images.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-1">
                {images.map((image) => (
                  <div key={image.label} className="overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200">
                    <div className="relative aspect-[3/4]">
                      <Image src={image.src} alt={`${item.title} ${image.label}`} fill sizes="(max-width: 768px) 50vw, 560px" className="object-cover" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex aspect-[3/4] items-center justify-center rounded-2xl bg-slate-100 text-slate-300">
                <BookOpen className="h-16 w-16" />
              </div>
            )}
          </section>

          <aside className="space-y-5">
            <div>
              <p className="mb-2 text-xs font-black text-primary">TextNext Demo</p>
              <h2 className="text-2xl font-black leading-tight text-slate-950">{item.title}</h2>
              {item.description && (
                <p className="mt-4 whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 text-sm font-bold leading-relaxed text-slate-600">
                  {item.description}
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <p className="text-sm font-bold text-slate-400">販売価格</p>
              <p className="mt-1 text-3xl font-black text-primary">¥{Number(item.selling_price ?? 0).toLocaleString()}</p>
              {item.original_price ? (
                <p className="mt-1 text-xs font-bold text-slate-400">定価 ¥{Number(item.original_price).toLocaleString()}</p>
              ) : null}
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <RewardAvatar src={avatarUrl} alt={profile?.nickname || "出品者"} size={48} listingCount={0} adminFrame />
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-slate-900">{profile?.nickname || "管理者"}</p>
                <p className="truncate text-xs font-bold text-slate-500">
                  {[profile?.department, profile?.major].filter(Boolean).join(" / ") || "TextNext管理者"}
                </p>
              </div>
            </div>

            {activeDemoTransaction ? (
              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm font-bold leading-relaxed text-blue-800">
                <div className="mb-2 flex items-center gap-2 font-black">
                  <MessageCircle className="h-4 w-4" />
                  デモ取引が開始済みです
                </div>
                <p className="mb-3">このデモ出品には進行中のデモチャットがあります。</p>
                <Link
                  href={`/chat/${item.id}?tx=${activeDemoTransaction.id}`}
                  className="inline-flex items-center justify-center rounded-xl bg-blue-700 px-4 py-2 text-xs font-black text-white"
                >
                  デモチャットを見る
                </Link>
              </div>
            ) : (
              <DemoTransactionForm itemId={item.id} itemTitle={item.title} />
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}
