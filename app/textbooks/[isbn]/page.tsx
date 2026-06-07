"use client";

export const dynamic = "force-dynamic";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getItemImageUrl } from "@/lib/image-storage";
import { normalizeIsbn13 } from "@/lib/isbn-share";

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

function TextbookListingsContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const rawIsbn = Array.isArray(params.isbn) ? params.isbn[0] : params.isbn;
  const isbn = normalizeIsbn13(rawIsbn);
  const title = searchParams.get("title") || "";

  const [items, setItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isbn) {
      setItems([]);
      setIsLoading(false);
      return;
    }

    (async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from("items")
          .select(
            "id, title, selling_price, status, front_image_url, front_thumbnail_url, front_image_storage_path, front_thumbnail_storage_path, image_storage_provider"
          )
          .eq("isbn", isbn)
          .in("status", ["available", "trading"])
          .eq("is_demo", false)
          .order("created_at", { ascending: false });

        if (!error && data) {
          setItems(data as Item[]);
        } else {
          setItems([]);
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, [isbn]);

  return (
    <div className="min-h-screen bg-white">
      <header className="bg-white px-6 pt-8 pb-6 border-b sticky top-0 z-10">
        <div className="flex items-center gap-4 mb-2">
          <button type="button" onClick={() => history.back()} aria-label="戻る">
            <ArrowLeft className="w-6 h-6 text-gray-600 hover:text-primary transition-colors" />
          </button>
          <h1 className="text-2xl font-bold text-primary truncate">
            {title || (isbn ? `ISBN ${isbn}` : "教科書")}
          </h1>
        </div>
        {isbn && <p className="text-xs text-gray-400 pl-10">ISBN {isbn}</p>}
      </header>

      <div className="px-6 py-6">
        {isLoading ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-2 border-gray-300 border-t-primary rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-500">検索中...</p>
          </div>
        ) : items.length > 0 ? (
          <>
            <h3 className="text-sm font-semibold text-gray-700 mb-4">{items.length}件の出品</h3>
            <div className="space-y-4">
              {items.map((item) => {
                const isTrading = item.status === "trading" || item.status === "transaction_pending";
                const imageUrl = getItemImageUrl(item, "front", "thumbnail");
                return (
                  <Link key={item.id} href={`/product/${item.id}`} prefetch={false}>
                    <div
                      className={`relative rounded-2xl border p-4 shadow-md transition-all duration-300 ${
                        isTrading
                          ? "border-gray-200 bg-gray-100"
                          : "border-gray-200 bg-white hover:shadow-xl hover:border-primary/30 hover:-translate-y-1"
                      }`}
                    >
                      {isTrading && (
                        <div className="absolute right-3 top-3 rounded-full bg-gray-700 px-2.5 py-1 text-[10px] font-black text-white shadow-sm">
                          取引中
                        </div>
                      )}
                      <div className="flex items-center gap-4">
                        <div
                          className={`h-20 w-14 flex-shrink-0 overflow-hidden rounded-xl bg-gray-100 border border-gray-100 shadow-sm ${
                            isTrading ? "grayscale opacity-70" : ""
                          }`}
                        >
                          {imageUrl ? (
                            <Image
                              src={imageUrl}
                              alt={item.title}
                              width={56}
                              height={80}
                              className="h-full w-full object-cover"
                              loading="lazy"
                              quality={55}
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <Search className="h-5 w-5 text-gray-300" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3
                            className={`text-lg font-bold mb-2 truncate ${
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
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500">現在この教科書の出品はありません</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TextbookListingsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-primary rounded-full animate-spin" />
        </div>
      }
    >
      <TextbookListingsContent />
    </Suspense>
  );
}
