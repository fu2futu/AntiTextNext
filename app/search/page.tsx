"use client";

export const dynamic = "force-dynamic";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams, useRouter } from "next/navigation";
import { ArrowLeft, Search, History, Heart, Bell, Loader2, CheckCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/lib/i18n";
import { getItemImageUrl } from "@/lib/image-storage";
import { LoginRequiredBubble, useLoginRequiredPrompt } from "@/components/login-required-prompt";

export type SearchHistory = {
  id: string;
  keyword: string;
  searched_at: string;
};

export type Item = {
  id: string;
  title: string;
  selling_price: number;
  front_image_url: string | null;
  front_thumbnail_url?: string | null;
  front_image_storage_path?: string | null;
  front_thumbnail_storage_path?: string | null;
  image_storage_provider?: string | null;
  //condition: string;
  favorite_count?: number;
  status?: string;
};

type Suggestion = {
  id: string;
  title: string;
};

// ひらがな→カタカナ変換
const hiraganaToKatakana = (str: string): string => {
  return str.replace(/[\u3041-\u3096]/g, (match) =>
    String.fromCharCode(match.charCodeAt(0) + 0x60)
  );
};

// カタカナ�?��?�らがな変換
const katakanaToHiragana = (str: string): string => {
  return str.replace(/[\u30A1-\u30F6]/g, (match) =>
    String.fromCharCode(match.charCodeAt(0) - 0x60)
  );
};

function SearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { t } = useI18n();

  const initialQuery = searchParams.get("q") || "";

  const [results, setResults] = useState<Item[]>([]);
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [searchHistory, setSearchHistory] = useState<SearchHistory[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [loginPromptItemId, setLoginPromptItemId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [watchSaving, setWatchSaving] = useState(false);
  const [watchSaved, setWatchSaved] = useState(false);
  const favoriteStateRef = useRef<Set<string>>(new Set());
  const favoriteSyncTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const loginPrompt = useLoginRequiredPrompt();

  useEffect(() => {
    favoriteStateRef.current = new Set(favorites);
  }, [favorites]);

  // 検索実�?
  const executeSearch = async (query: string) => {
    if (!query.trim()) return;

    setIsLoading(true);
    setShowSuggestions(false);
    setHasSearched(true);
    setWatchSaved(false);

    try {
      // ひらがな・カタカナ変換
      const hiragana = katakanaToHiragana(query);
      const katakana = hiraganaToKatakana(query);

      // 重�?を除去した検索パターン
      const searches = [query, hiragana, katakana].filter((v, i, a) => a.indexOf(v) === i);

      // �?パターンで検索を実�?
      const searchResults = await Promise.all(
        searches.map(async (searchTerm) => {
          const { data, error } = await supabase
            .from("items")
            .select("id, title, selling_price, status, front_image_url, front_thumbnail_url, front_image_storage_path, front_thumbnail_storage_path, image_storage_provider, favorites(count)")
            .in("status", ["available", "trading"])
            .ilike("title", `%${searchTerm}%`)
            .order("created_at", { ascending: false })
            .limit(20);

          if (error) {
            console.error("Search error:", error);
            return [];
          }
          return data || [];
        })
      );

      // 結果を結合して重�?を除去
      const allResults = searchResults.flat();
      const seenIds = new Set<string>();
      const uniqueResults = allResults.filter((item: any) => {
        if (seenIds.has(item.id)) return false;
        seenIds.add(item.id);
        return true;
      });

      const mappedResults = uniqueResults.map((item: any) => ({
        ...item,
        favorite_count: item.favorites?.[0]?.count || 0,
        favorites: undefined
      })) as Item[];

      setResults(mappedResults);

      // 検索履歴の保�?
      if (user) {
        (supabase.from("search_histories") as any).insert({
          user_id: user.id,
          keyword: query,
        }).then(() => { }).catch(() => { });
      }
    } catch (err) {
      console.error("Search error:", err);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  // URLパラメータからの初期検索
  useEffect(() => {
    if (initialQuery) {
      setSearchQuery(initialQuery);
      executeSearch(initialQuery);
    }
  }, []);

  // サジェスト取�?
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const fetchSuggestions = async () => {
      try {
        const hiragana = katakanaToHiragana(searchQuery);
        const katakana = hiraganaToKatakana(searchQuery);
        const searches = [searchQuery, hiragana, katakana].filter((v, i, a) => a.indexOf(v) === i);

        const results = await Promise.all(
          searches.map(async (searchTerm) => {
            const { data, error } = await supabase
              .from("items")
              .select("id, title")
              .in("status", ["available", "trading"])
              .ilike("title", `%${searchTerm}%`)
              .limit(5);

            if (error) return [];
            return data || [];
          })
        );

        const allResults = results.flat();
        const uniqueTitles = new Map<string, Suggestion>();
        allResults.forEach((item: any) => {
          if (!uniqueTitles.has(item.title)) {
            uniqueTitles.set(item.title, { id: item.id, title: item.title });
          }
        });

        setSuggestions(Array.from(uniqueTitles.values()).slice(0, 5));
        setShowSuggestions(true);
      } catch (err) {
        // サジェストエラーは無�?
      }
    };

    const debounceTimer = setTimeout(fetchSuggestions, 200);
    return () => clearTimeout(debounceTimer);
  }, [searchQuery]);

  // お気に入り取�?
  useEffect(() => {
    if (user && results.length > 0) {
      supabase
        .from("favorites")
        .select("item_id")
        .eq("user_id", user.id)
        .then(({ data }) => {
          if (data) {
            setFavorites(data.map((f: any) => f.item_id));
          }
        });
    }
  }, [user, results]);

  // 検索履歴取�?
  useEffect(() => {
    if (user && !authLoading) {
      supabase
        .from("search_histories")
        .select("id, keyword, searched_at")
        .eq("user_id", user.id)
        .order("searched_at", { ascending: false })
        .limit(5)
        .then(({ data }) => {
          if (data) {
            setSearchHistory(data as SearchHistory[]);
          }
        });
    }
  }, [user, authLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery)}`);
      executeSearch(searchQuery);
    }
  };

  const handleSuggestionClick = (suggestion: Suggestion) => {
    setSearchQuery(suggestion.title);
    router.push(`/search?q=${encodeURIComponent(suggestion.title)}`);
    executeSearch(suggestion.title);
  };

  const handleHistoryClick = (keyword: string) => {
    setSearchQuery(keyword);
    router.push(`/search?q=${encodeURIComponent(keyword)}`);
    executeSearch(keyword);
  };

  const toggleFavorite = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!user) {
      setLoginPromptItemId(id);
      loginPrompt.show();
      return;
    }

    const wasFavorite = favoriteStateRef.current.has(id);
    const shouldFavorite = !wasFavorite;

    if (shouldFavorite) {
      favoriteStateRef.current.add(id);
    } else {
      favoriteStateRef.current.delete(id);
    }

    setFavorites(prev =>
      shouldFavorite
        ? (prev.includes(id) ? prev : [...prev, id])
        : prev.filter(favId => favId !== id)
    );

    const delta = shouldFavorite ? 1 : -1;
    setResults(prev => prev.map(item => {
      if (item.id === id) {
        return {
          ...item,
          favorite_count: Math.max(0, (item.favorite_count || 0) + delta)
        };
      }
      return item;
    }));

    const existingTimer = favoriteSyncTimersRef.current.get(id);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(async () => {
      try {
        if (shouldFavorite) {
          await (supabase
            .from("favorites") as any)
            .upsert({ user_id: user.id, item_id: id }, { onConflict: 'user_id,item_id' });
        } else {
          await (supabase
            .from("favorites") as any)
            .delete()
            .match({ user_id: user.id, item_id: id });
        }
      } catch (err) {
        if (favoriteStateRef.current.has(id) === shouldFavorite) {
          if (wasFavorite) {
            favoriteStateRef.current.add(id);
          } else {
            favoriteStateRef.current.delete(id);
          }
          setFavorites(prev =>
            wasFavorite
              ? (prev.includes(id) ? prev : [...prev, id])
              : prev.filter(favId => favId !== id)
          );
          const rollbackDelta = wasFavorite ? 1 : -1;
          setResults(prev => prev.map(item =>
            item.id === id
              ? { ...item, favorite_count: Math.max(0, (item.favorite_count || 0) + rollbackDelta) }
              : item
          ));
        }
      } finally {
        favoriteSyncTimersRef.current.delete(id);
      }
    }, 220);

    favoriteSyncTimersRef.current.set(id, timer);
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-white px-6 pt-8 pb-6 border-b sticky top-0 z-10">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/">
            <ArrowLeft className="w-6 h-6 text-gray-600 hover:text-primary transition-colors" />
          </Link>
          <h1 className="text-3xl font-bold text-primary">
            検索
          </h1>
        </div>

        {/* Search Bar with Suggestions */}
        <form onSubmit={handleSubmit} className="relative">
          <div className="relative">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
              <Search className="w-5 h-5 text-gray-400" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => searchQuery.length > 0 && setShowSuggestions(true)}
              placeholder={t('home.search_placeholder')}
              className="w-full py-3 pl-12 pr-4 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
            />
          </div>

          {/* Suggestions Dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute left-0 right-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-lg z-20 max-h-64 overflow-y-auto">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion.id}
                  type="button"
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-center gap-3 border-b last:border-b-0"
                >
                  <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span className="text-gray-900 truncate">{suggestion.title}</span>
                </button>
              ))}
            </div>
          )}
        </form>
      </header>

      {/* Click outside to close suggestions */}
      {showSuggestions && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setShowSuggestions(false)}
        />
      )}

      {/* Search History */}
      {user && searchHistory.length > 0 && !searchQuery && (
        <div className="px-6 py-6 border-b">
          <div className="flex items-center gap-2 mb-4">
            <History className="w-5 h-5 text-gray-600" />
            <h2 className="text-sm font-semibold text-gray-700">検索履歴</h2>
          </div>
          <div className="space-y-2">
            {searchHistory.map((history) => (
              <button
                key={history.id}
                onClick={() => handleHistoryClick(history.keyword)}
                className="w-full text-left px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <Search className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-900">{history.keyword}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search Results */}
      <div className="px-6 py-6">
        {isLoading ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-2 border-gray-300 border-t-primary rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-500">検索中...</p>
          </div>
        ) : results.length > 0 ? (
          <>
            <h3 className="text-sm font-semibold text-gray-700 mb-4">
              {results.length}件の結果
            </h3>
            <div className="relative ml-2 space-y-4 border-l-2 border-primary/15 pl-5">
              {results.map((item) => {
                const isTrading = item.status === "trading" || item.status === "transaction_pending";

                return (
                <Link key={item.id} href={`/product/${item.id}`} prefetch={false}>
                  <div className={`relative rounded-2xl border p-4 shadow-md transition-all duration-300 ${isTrading ? "border-gray-200 bg-gray-100" : "border-gray-200 bg-white hover:shadow-xl hover:border-primary/30 hover:-translate-y-1"}`}>
                    <div className="absolute -left-[31px] top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-white bg-primary/30 shadow-sm" />
                    {isTrading && (
                      <div className="absolute right-3 top-3 rounded-full bg-gray-700 px-2.5 py-1 text-[10px] font-black text-white shadow-sm">
                        取引中
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-4">
                      <div className={`h-20 w-14 flex-shrink-0 overflow-hidden rounded-xl bg-gray-100 border border-gray-100 shadow-sm ${isTrading ? "grayscale opacity-70" : ""}`}>
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
                            <Search className="h-5 w-5 text-gray-300" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        {/* <div className="text-xs font-medium text-gray-500 mb-1">
                          {item.condition}
                        </div> */}
                        <h3 className={`text-lg font-bold mb-2 truncate ${isTrading ? "text-gray-500" : "text-gray-900"}`}>
                          {item.title}
                        </h3>
                        <p className={`text-xl font-bold ${isTrading ? "text-gray-500" : "text-primary"}`}>
                          ¥{item.selling_price.toLocaleString()}
                        </p>
                      </div>

                      <div className="relative flex items-center gap-1">
                        <LoginRequiredBubble visible={loginPrompt.visible && loginPromptItemId === item.id} />
                        <button
                          onClick={(e) => toggleFavorite(item.id, e)}
                          className="group/heart relative p-2 -m-2 hover:bg-red-50 rounded-full transition-all active:scale-90 flex items-center justify-center"
                          aria-label={favorites.includes(item.id) ? "お気に入りから削除" : "お気に入りに追�?"}
                        >
                          <Heart
                            className={`w-6 h-6 transition-all duration-300 ${favorites.includes(item.id)
                              ? "fill-red-500 text-red-500"
                              : "text-gray-300 group-hover/heart:text-red-300"
                              }`}
                          />
                        </button>
                        {item.favorite_count !== undefined && item.favorite_count > 0 && (
                          <span className={`text-xs font-bold transition-colors duration-300 ${favorites.includes(item.id) ? 'text-red-500' : 'text-gray-400'}`}>
                            {item.favorite_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              )})}
            </div>
          </>
        ) : hasSearched ? (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">結果が見つかりませんでした</p>
            {user && searchQuery.trim() && (
              <div className="max-w-xs mx-auto">
                {watchSaved ? (
                  <div className="flex items-center justify-center gap-2 text-green-600 font-medium py-3">
                    <CheckCircle className="w-5 h-5" />
                    <span>登録しました！出品されたら通知します</span>
                  </div>
                ) : (
                  <button
                    onClick={async () => {
                      setWatchSaving(true);
                      try {
                        const res = await fetch("/api/watch-keywords", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ keyword: searchQuery.trim() }),
                        });
                        const data = await res.json();
                        if (res.ok) {
                          setWatchSaved(true);
                        } else {
                          alert(data.error || "登録に失敗しました");
                        }
                      } catch {
                        alert("通信エラーが発生しました");
                      } finally {
                        setWatchSaving(false);
                      }
                    }}
                    disabled={watchSaving}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-primary/10 text-primary rounded-xl font-semibold hover:bg-primary/20 transition-all disabled:opacity-50"
                  >
                    {watchSaving ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Bell className="w-5 h-5" />
                    )}
                    「{searchQuery}」が出品されたら通知
                  </button>
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-gray-300 border-t-primary rounded-full animate-spin" />
      </div>
    }>
      <SearchContent />
    </Suspense>
  );
}
