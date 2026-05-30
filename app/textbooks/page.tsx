"use client";

export const dynamic = "force-dynamic";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, BookOpen, ChevronRight, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { decodeBooksParam, type SharedBook } from "@/lib/isbn-share";

type BookRow = SharedBook & { count: number };

function TextbooksContent() {
  const searchParams = useSearchParams();
  const [books, setBooks] = useState<BookRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const requested = decodeBooksParam(searchParams.get("d"));

    if (requested.length === 0) {
      setBooks([]);
      setIsLoading(false);
      return;
    }

    const isbns = requested.map((b) => b.isbn);

    (async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from("items")
          .select("isbn")
          .in("isbn", isbns)
          .in("status", ["available", "trading"]);

        const counts = new Map<string, number>();
        if (!error && data) {
          for (const row of data as { isbn: string | null }[]) {
            if (row.isbn) counts.set(row.isbn, (counts.get(row.isbn) || 0) + 1);
          }
        }

        const rows: BookRow[] = requested.map((b) => ({
          ...b,
          count: counts.get(b.isbn) || 0,
        }));

        // 出品ありを上に、件数の多い順。出品なしは下にタイトル順。
        rows.sort((a, b) => {
          if ((a.count > 0) !== (b.count > 0)) return a.count > 0 ? -1 : 1;
          if (a.count !== b.count) return b.count - a.count;
          return a.title.localeCompare(b.title, "ja");
        });

        setBooks(rows);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [searchParams]);

  const availableCount = books.filter((b) => b.count > 0).length;

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-white px-6 pt-8 pb-6 border-b sticky top-0 z-10">
        <div className="flex items-center gap-4 mb-2">
          <Link href="/">
            <ArrowLeft className="w-6 h-6 text-gray-600 hover:text-primary transition-colors" />
          </Link>
          <h1 className="text-3xl font-bold text-primary">履修教科書</h1>
        </div>
        {!isLoading && books.length > 0 && (
          <p className="text-sm text-gray-500 pl-10">
            {books.length}冊中 <span className="font-bold text-primary">{availableCount}冊</span> に出品があります
          </p>
        )}
      </header>

      <div className="px-6 py-6">
        {isLoading ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-2 border-gray-300 border-t-primary rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-500">検索中...</p>
          </div>
        ) : books.length === 0 ? (
          <div className="text-center py-12">
            <BookOpen className="w-10 h-10 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">教科書が指定されていません</p>
            <p className="text-gray-400 text-sm mt-2">
              isctの教科書ページの「textnextで探す」から開いてください
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {books.map((book) => {
              const hasListings = book.count > 0;
              const inner = (
                <div
                  className={`flex items-center gap-4 rounded-2xl border p-4 transition-all ${
                    hasListings
                      ? "border-gray-200 bg-white hover:shadow-lg hover:border-primary/30 hover:-translate-y-0.5"
                      : "border-gray-100 bg-gray-50"
                  }`}
                >
                  <div
                    className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${
                      hasListings ? "bg-primary/10 text-primary" : "bg-gray-100 text-gray-300"
                    }`}
                  >
                    <BookOpen className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3
                      className={`truncate text-base font-bold ${
                        hasListings ? "text-gray-900" : "text-gray-500"
                      }`}
                    >
                      {book.title || book.isbn}
                    </h3>
                    <p className="mt-0.5 text-xs text-gray-400">ISBN {book.isbn}</p>
                  </div>
                  {hasListings ? (
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-primary px-3 py-1 text-xs font-black text-white">
                        出品{book.count}件
                      </span>
                      <ChevronRight className="h-5 w-5 text-gray-300" />
                    </div>
                  ) : (
                    <span className="rounded-full bg-gray-200 px-3 py-1 text-xs font-bold text-gray-500">
                      出品なし
                    </span>
                  )}
                </div>
              );

              return hasListings ? (
                <Link
                  key={book.isbn}
                  href={`/textbooks/${book.isbn}?title=${encodeURIComponent(book.title)}`}
                  prefetch={false}
                >
                  {inner}
                </Link>
              ) : (
                <div key={book.isbn}>{inner}</div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function TextbooksPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-primary rounded-full animate-spin" />
        </div>
      }
    >
      <TextbooksContent />
    </Suspense>
  );
}
