"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Search, History, Heart } from "lucide-react";
import { useState, useEffect, useMemo, useRef, useCallback, memo } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth-provider";

export type SearchHistory = {
  id: string;
  keyword: string;
  searched_at: string;
};

export type Item = {
  id: string;
  title: string;
  selling_price: number;
  //condition: string;
  favorite_count?: number;
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

// カタカナ??????らがな変換
const katakanaToHiragana = (str: string): string => {
  return str.replace(/[\u30A1-\u30F6]/g, (match) =>
    String.fromCharCode(match.charCodeAt(0) - 0x60)
  );
};

type SearchClientProps = {
  initialResults: Item[];
  initialQuery: string;
};

// 検索結果アイ????をメモ??
const SearchResultItem = memo(function SearchResultItem({
  item,
  isFavorite,
  onToggleFavorite
}: {
  item: Item;
  isFavorite: boolean;
  onToggleFavorite: (id: string, e: React.MouseEvent) => void;
}) {
  return (
    <Link href={`/product/${item.id}`} prefetch={false}>
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-md hover:shadow-xl hover:border-primary/30 hover:-translate-y-1 transition-all duration-300">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            {/* <div className="text-xs font-medium text-gray-500 mb-1">
              {item.condition}
            </div> */}
            <h3 className="text-lg font-bold text-gray-900 mb-2 truncate">
              {item.title}
            </h3>
            <p className="text-xl font-bold text-primary">
              \{item.selling_price.toLocaleString()}
            </p>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={(e) => onToggleFavorite(item.id, e)}
              className="group/heart relative p-2 -m-2 hover:bg-red-50 rounded-full transition-all active:scale-90 flex items-center justify-center heart-container"
              aria-label={isFavorite ? "お気に入りから削除" : "お気に入りに追??"}
            >
              {/* Expanding Ring */}
              <div className={`heart-ring ${isFavorite ? 'active' : ''}`} />

              {/* Particles */}
              <div className={`heart-particle-container ${isFavorite ? 'active' : ''}`}>
                {[...Array(7)].map((_, i) => (
                  <div key={i} className="heart-dot" />
                ))}
              </div>

              <Heart
                className={`w-6 h-6 transition-all duration-300 relative heart-main ${isFavorite
                  ? "fill-red-500 text-red-500 heart-pop"
                  : "text-gray-300 group-hover/heart:text-red-300"
                  }`}
              />
            </button>
            {item.favorite_count !== undefined && item.favorite_count > 0 && (
              <span className={`text-xs font-bold transition-colors duration-300 ${isFavorite ? 'text-red-500' : 'text-gray-400'}`}>
                {item.favorite_count}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
});

export default function SearchClient({ initialResults, initialQuery }: SearchClientProps) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [results, setResults] = useState<Item[]>(initialResults);
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [searchHistory, setSearchHistory] = useState<SearchHistory[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const historyLoadedRef = useRef(false);

  // ??字変換結果???サジェスト用???
  const convertedQuery = useMemo(() => {
    const q = searchQuery.trim();
    return {
      original: q,
      hiragana: katakanaToHiragana(q),
      katakana: hiraganaToKatakana(q),
    };
  }, [searchQuery]);

  // 初期表示時にお気に入?? & 最新のカウントをロード（キャ??シュ対策??
  useEffect(() => {
    const fetchData = async () => {
      const itemIds = initialResults.map(item => item.id);
      if (itemIds.length === 0) return;

      // 1. ??アイ????の最新カウントを取?? (items??ーブルから)
      // 2. 自??の追??済みお気に入りを取?? (userがいる?????)
      const promises: any[] = [
        supabase
          .from("items")
          .select("id, favorites(count)")
          .in("id", itemIds)
          .eq("is_demo", false)
      ];

      if (user) {
        promises.push(
          supabase
            .from("favorites")
            .select("item_id")
            .eq("user_id", user.id)
        );
      }

      const [countRes, favRes] = await Promise.all(promises);

      if (countRes.data) {
        const countsMap = new Map((countRes.data as any[]).map((i: any) => [i.id, i.favorites?.[0]?.count || 0]));
        setResults(prevResults =>
          prevResults.map(item => ({
            ...item,
            favorite_count: countsMap.get(item.id) ?? item.favorite_count,
          }))
        );
      }

      if (user && favRes?.data) {
        setFavorites(favRes.data.map((f: any) => f.item_id));
      } else if (!user) {
        setFavorites([]);
      }
    };
    fetchData();
  }, [user, initialResults]);

  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);

  const toggleFavorite = useCallback(async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!user) return;

    const isFav = favoriteSet.has(id);

    // 楽観的UI更新
    setFavorites(prev =>
      isFav ? prev.filter(favId => favId !== id) : [...prev, id]
    );

    // カウント???見た目上???調整
    setResults(prev => prev.map(item => {
      if (item.id === id) {
        return {
          ...item,
          favorite_count: Math.max(0, (item.favorite_count || 0) + (isFav ? -1 : 1))
        };
      }
      return item;
    }));

    // バックエンド同??
    try {
      if (isFav) {
        await (supabase
          .from("favorites") as any)
          .delete()
          .match({ user_id: user.id, item_id: id });
      } else {
        await (supabase
          .from("favorites") as any)
          .upsert({ user_id: user.id, item_id: id }, { onConflict: 'user_id,item_id' });
      }
    } catch (err) {
      console.error("Favorite sync failed:", err);
      // Rollback
      setFavorites(prev =>
        isFav ? [...prev, id] : prev.filter(favId => favId !== id)
      );
    }
  }, [user, favoriteSet]);

  // 入力時にサジェストを取得（デバウンス強化??
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const fetchSuggestions = async () => {
      try {
        const { original: query, hiragana, katakana } = convertedQuery;
        const now = new Date().toISOString();
        const { data, error } = await supabase
          .from("items")
          .select("id, title")
          .eq("status", "available")
          .eq("is_demo", false)
          .or(`locked_until.is.null,locked_until.lt.${now}`)
          .or(`title.ilike.%${query}%,title.ilike.%${hiragana}%,title.ilike.%${katakana}%`)
          .limit(5);

        if (error) throw error;

        const uniqueTitles = new Map<string, Suggestion>();
        (data || []).forEach((item: any) => {
          if (!uniqueTitles.has(item.title)) {
            uniqueTitles.set(item.title, { id: item.id, title: item.title });
          }
        });

        setSuggestions(Array.from(uniqueTitles.values()));
        setShowSuggestions(true);
      } catch (err) {
        // サジェスト???エラーは無??
      }
    };

    const debounceTimer = setTimeout(fetchSuggestions, 200);
    return () => clearTimeout(debounceTimer);
  }, [searchQuery, convertedQuery]);

  const loadSearchHistory = useCallback(async () => {
    if (!user) return;

    try {
      const { data } = await supabase
        .from("search_histories")
        .select("id, keyword, searched_at")
        .eq("user_id", user.id)
        .order("searched_at", { ascending: false })
        .limit(5);

      if (data) {
        setSearchHistory(data as SearchHistory[]);
      }
    } catch (err) {
      // 履歴読み込みエラーは無??
    }
  }, [user]);

  const executeSearch = useCallback((keyword: string) => {
    if (!keyword.trim()) return;

    setShowSuggestions(false);
    setSearchQuery(keyword);
    router.push(`/search?q=${encodeURIComponent(keyword)}`);

    // 検索履歴の保存（非同期・バックグラウンドで実行??
    if (user) {
      (supabase.from("search_histories") as any).insert({
        user_id: user.id,
        keyword: keyword,
      }).then(() => {
        // 履歴更新は次回表示時に行う???即時更新しな?????
      }).catch(() => { });
    }
  }, [router, user]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeSearch(searchQuery);
  };

  const handleSuggestionClick = (suggestion: Suggestion) => {
    executeSearch(suggestion.title);
  };

  const handleHistoryClick = (keyword: string) => {
    executeSearch(keyword);
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
              placeholder="教科書名を入れてください"
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
        {initialResults.length > 0 ? (
          <>
            <h3 className="text-sm font-semibold text-gray-700 mb-4">
              {results.length}件の結果
            </h3>
            <div className="space-y-4">
              {results.map((item) => (
                <SearchResultItem
                  key={item.id}
                  item={item}
                  isFavorite={favoriteSet.has(item.id)}
                  onToggleFavorite={toggleFavorite}
                />
              ))}
            </div>
          </>
        ) : initialQuery ? (
          <div className="text-center py-12">
            <p className="text-gray-500">結果が見つかりませんでした</p>
          </div>
        ) : null}
      </div>

      <SearchHistoryEffect
        user={user}
        authLoading={authLoading}
        historyLoadedRef={historyLoadedRef}
        loadSearchHistory={loadSearchHistory}
      />
    </div>
  );
}

// 履歴読み込み用サブルーチン???メインコンポ???ネントをス??キリさせるた?????
function SearchHistoryEffect({ user, authLoading, historyLoadedRef, loadSearchHistory }: any) {
  useEffect(() => {
    if (authLoading || !user || historyLoadedRef.current) return;

    const timer = setTimeout(() => {
      if (historyLoadedRef.current) return;
      historyLoadedRef.current = true;
      loadSearchHistory();
    }, 100);

    return () => clearTimeout(timer);
  }, [user, authLoading, historyLoadedRef, loadSearchHistory]);

  return null;
}
