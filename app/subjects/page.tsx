"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ChevronRight, BookOpen, Layers } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getItemImageUrl } from "@/lib/image-storage";

type Dept = { dept: string; dept_label: string };
type SubjectTaxonomy = { school: string; depts: Dept[] };

type Item = {
  id: string;
  title: string;
  selling_price: number;
  status?: string;
  front_image_url: string | null;
  front_thumbnail_url?: string | null;
  front_image_storage_path?: string | null;
  front_thumbnail_storage_path?: string | null;
  image_storage_provider?: string | null;
};

const ITEM_SELECT =
  "id, title, selling_price, status, front_image_url, front_thumbnail_url, front_image_storage_path, front_thumbnail_storage_path, image_storage_provider";

export default function SubjectsPage() {
  const [taxonomy, setTaxonomy] = useState<SubjectTaxonomy[]>([]);
  const [isbnsByDept, setIsbnsByDept] = useState<Record<string, string[]>>({});
  const [loadingFacets, setLoadingFacets] = useState(true);

  const [school, setSchool] = useState<string | null>(null);
  const [dept, setDept] = useState<Dept | null>(null);

  const [items, setItems] = useState<Item[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  // 学院/系の選択肢と対象ISBNを参照型で取得（isct シラバスAPI経由）
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/subjects/facets");
        if (!res.ok) return;
        const data = (await res.json()) as {
          taxonomy?: SubjectTaxonomy[];
          byDept?: Record<string, string[]>;
        };
        setTaxonomy(data.taxonomy || []);
        setIsbnsByDept(data.byDept || {});
      } catch {
        // 取得失敗時は空表示
      } finally {
        setLoadingFacets(false);
      }
    })();
  }, []);

  // 系が選ばれたら、その分野のISBNで出品を取得
  useEffect(() => {
    if (!dept) {
      setItems([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingItems(true);
      try {
        const isbns = isbnsByDept[dept.dept] || [];
        if (isbns.length === 0) {
          if (!cancelled) setItems([]);
          return;
        }
        const { data, error } = await supabase
          .from("items")
          .select(ITEM_SELECT)
          .in("status", ["available", "trading"])
          .in("isbn", isbns)
          .order("created_at", { ascending: false })
          .limit(100);
        if (!cancelled) setItems(error ? [] : ((data || []) as Item[]));
      } finally {
        if (!cancelled) setLoadingItems(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dept, isbnsByDept]);

  // 戻る：系→学院→ホーム の順で1段ずつ
  const handleBack = () => {
    if (dept) setDept(null);
    else if (school) setSchool(null);
  };

  const currentDepts = school ? taxonomy.find((t) => t.school === school)?.depts ?? [] : [];

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-white px-6 pt-8 pb-6 border-b sticky top-0 z-10">
        <div className="flex items-center gap-4 mb-2">
          {school || dept ? (
            <button onClick={handleBack} aria-label="戻る">
              <ArrowLeft className="w-6 h-6 text-gray-600 hover:text-primary transition-colors" />
            </button>
          ) : (
            <Link href="/" aria-label="ホームへ">
              <ArrowLeft className="w-6 h-6 text-gray-600 hover:text-primary transition-colors" />
            </Link>
          )}
          <h1 className="text-3xl font-bold text-primary">分野から探す</h1>
        </div>
        {/* パンくず */}
        <p className="pl-10 text-sm text-gray-400">
          {dept ? (
            <span>
              {school} <span className="text-gray-300">/</span>{" "}
              <span className="font-semibold text-gray-600">{dept.dept_label}</span>
            </span>
          ) : school ? (
            <span className="font-semibold text-gray-600">{school}</span>
          ) : (
            "学院 → 系 を選んで出品を絞り込み"
          )}
        </p>
      </header>

      <div className="px-6 py-6">
        {loadingFacets ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-2 border-gray-300 border-t-primary rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-500">読み込み中...</p>
          </div>
        ) : taxonomy.length === 0 ? (
          <div className="text-center py-12">
            <BookOpen className="w-10 h-10 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">分野データがまだありません</p>
          </div>
        ) : !school ? (
          /* ── Step 1: 学院一覧 ── */
          <div className="space-y-3">
            {taxonomy.map((t) => (
              <button
                key={t.school}
                onClick={() => setSchool(t.school)}
                className="flex w-full items-center gap-4 rounded-2xl border border-gray-200 bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg"
              >
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Layers className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-base font-bold text-gray-900">{t.school}</h3>
                  <p className="mt-0.5 text-xs text-gray-400">{t.depts.length}系</p>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-300" />
              </button>
            ))}
          </div>
        ) : !dept ? (
          /* ── Step 2: 系一覧 ── */
          <div className="space-y-3">
            {currentDepts.map((d) => (
              <button
                key={d.dept}
                onClick={() => setDept(d)}
                className="flex w-full items-center gap-4 rounded-2xl border border-gray-200 bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg"
              >
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-base font-bold text-gray-900">{d.dept_label}</h3>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-300" />
              </button>
            ))}
          </div>
        ) : (
          /* ── Step 3: 出品一覧 ── */
          <>
            {loadingItems ? (
              <div className="text-center py-12">
                <div className="w-8 h-8 border-2 border-gray-300 border-t-primary rounded-full animate-spin mx-auto mb-4" />
                <p className="text-gray-500">検索中...</p>
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-12">
                <BookOpen className="w-10 h-10 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">この分野の出品はまだありません</p>
              </div>
            ) : (
              <>
                <h3 className="mb-4 text-sm font-semibold text-gray-700">{items.length}件の出品</h3>
                <div className="space-y-4">
                  {items.map((item) => {
                    const isTrading = item.status === "trading" || item.status === "transaction_pending";
                    return (
                      <Link key={item.id} href={`/product/${item.id}`} prefetch={false}>
                        <div
                          className={`relative rounded-2xl border p-4 shadow-md transition-all duration-300 ${
                            isTrading
                              ? "border-gray-200 bg-gray-100"
                              : "border-gray-200 bg-white hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl"
                          }`}
                        >
                          {isTrading && (
                            <div className="absolute right-3 top-3 rounded-full bg-gray-700 px-2.5 py-1 text-[10px] font-black text-white shadow-sm">
                              取引中
                            </div>
                          )}
                          <div className="flex items-center justify-between gap-4">
                            <div
                              className={`h-20 w-14 flex-shrink-0 overflow-hidden rounded-xl border border-gray-100 bg-gray-100 shadow-sm ${
                                isTrading ? "opacity-70 grayscale" : ""
                              }`}
                            >
                              {getItemImageUrl(item, "front", "thumbnail") ? (
                                <Image
                                  src={getItemImageUrl(item, "front", "thumbnail")!}
                                  alt={item.title}
                                  width={56}
                                  height={80}
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                  quality={55}
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center">
                                  <BookOpen className="h-5 w-5 text-gray-300" />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <h3
                                className={`mb-2 truncate text-lg font-bold ${
                                  isTrading ? "text-gray-500" : "text-gray-900"
                                }`}
                              >
                                {item.title}
                              </h3>
                              <p className={`text-xl font-bold ${isTrading ? "text-gray-500" : "text-primary"}`}>
                                ¥{item.selling_price.toLocaleString()}
                              </p>
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
