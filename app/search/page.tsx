"use client";

export const dynamic = "force-dynamic";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams, useRouter } from "next/navigation";
import { ArrowLeft, Search, History, Heart, Bell, Loader2, CheckCircle, SlidersHorizontal, BookOpen } from "lucide-react";
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
  isbn?: string | null;
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
  isbn?: string | null;
  front_image_url?: string | null;
  front_thumbnail_url?: string | null;
  front_image_storage_path?: string | null;
  front_thumbnail_storage_path?: string | null;
  image_storage_provider?: string | null;
};

type SearchMode = "keyword" | "selected_item";

type LibraryBook = {
  source: "textnext" | "external";
  itemId?: string;
  itemIds?: string[];
  textnextItemCount?: number;
  title: string;
  isbn: string;
  authors?: string[];
  publisher?: string | null;
  imageUrl?: string | null;
  reserveUrl?: string | null;
  statuses: Array<{ name: string; status: string; available: boolean }>;
  hasHolding: boolean;
  fetchedAt: string;
};

type LibraryState = {
  loading: boolean;
  error: string;
  textnext: LibraryBook[];
  suggestions: LibraryBook[];
  progress?: {
    externalTotalCount: number;
    externalCheckedCount: number;
    externalOffset: number;
    externalLimit: number;
    externalHasMore: boolean;
    externalCompleted: boolean;
  };
  errors?: Array<{ source: string; message: string }>;
  debug?: Record<string, unknown>;
  fetchedAt?: string;
};

// 学院 -> 系（分野フィルタの選択肢）。book_subjects から動的に構築。
type SubjectTaxonomy = {
  school: string;
  depts: { dept: string; dept_label: string }[];
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

const formatLibraryFetchedAt = (value?: string) => {
  if (!value) return "";
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60000));
  if (minutes < 1) return "たった今更新";
  if (minutes < 60) return `${minutes}分前に更新`;
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
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
  const [searchMode, setSearchMode] = useState<SearchMode>("keyword");
  const [selectedSuggestion, setSelectedSuggestion] = useState<Suggestion | null>(null);
  const [libraryState, setLibraryState] = useState<LibraryState>({
    loading: false,
    error: "",
    textnext: [],
    suggestions: [],
  });
  const favoriteStateRef = useRef<Set<string>>(new Set());
  const favoriteSyncTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const libraryRequestSeqRef = useRef(0);
  const loginPrompt = useLoginRequiredPrompt();

  // 分野フィルタ（学院＋系）
  const [taxonomy, setTaxonomy] = useState<SubjectTaxonomy[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<string | null>(null);
  const [selectedDept, setSelectedDept] = useState<string | null>(null);

  // book_subjects から学院＋系の選択肢を構築
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("book_subjects")
        .select("school, dept, dept_label");
      if (error || !data) return;
      const map = new Map<string, Map<string, string>>();
      for (const r of data as { school: string; dept: string; dept_label: string }[]) {
        if (!map.has(r.school)) map.set(r.school, new Map());
        map.get(r.school)!.set(r.dept, r.dept_label);
      }
      const tax: SubjectTaxonomy[] = Array.from(map.entries()).map(([school, depts]) => ({
        school,
        depts: Array.from(depts.entries()).map(([dept, dept_label]) => ({ dept, dept_label })),
      }));
      setTaxonomy(tax);
    })();
  }, []);

  useEffect(() => {
    favoriteStateRef.current = new Set(favorites);
  }, [favorites]);

  const ITEM_SELECT =
    "id, title, isbn, selling_price, status, front_image_url, front_thumbnail_url, front_image_storage_path, front_thumbnail_storage_path, image_storage_provider, favorites(count)";

  // キーワード（任意）＋分野フィルタ（任意）を組み合わせて検索する。
  // 分野が選択されている場合、book_subjects から対象ISBNを引き、items を絞り込む。
  const runSearch = async (query: string, school: string | null, dept: string | null) => {
    const trimmed = query.trim();
    const hasQuery = trimmed.length > 0;
    const hasSubject = !!school;

    if (!hasQuery && !hasSubject) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    setIsLoading(true);
    setShowSuggestions(false);
    setHasSearched(true);
    setWatchSaved(false);

    try {
      // 分野が選択されていれば対象ISBN集合を取得
      let isbnFilter: string[] | null = null;
      if (hasSubject) {
        let sq = supabase.from("book_subjects").select("isbn").eq("school", school!);
        if (dept) sq = sq.eq("dept", dept);
        const { data: subjData } = await sq.limit(2000);
        isbnFilter = Array.from(new Set((subjData || []).map((r: any) => r.isbn as string)));
        if (isbnFilter.length === 0) {
          setResults([]);
          setIsLoading(false);
          return;
        }
      }

      let rawResults: any[] = [];
      if (hasQuery) {
        // ひらがな・カタカナ変換した複数パターンで検索（分野フィルタと AND）
        const hiragana = katakanaToHiragana(trimmed);
        const katakana = hiraganaToKatakana(trimmed);
        const searches = [trimmed, hiragana, katakana].filter((v, i, a) => a.indexOf(v) === i);

        const searchResults = await Promise.all(
          searches.map(async (searchTerm) => {
            let q = supabase
              .from("items")
              .select(ITEM_SELECT)
              .in("status", ["available", "trading"])
              .eq("is_demo", false)
              .ilike("title", `%${searchTerm}%`);
            if (isbnFilter) q = q.in("isbn", isbnFilter);
            const { data, error } = await q.order("created_at", { ascending: false }).limit(20);
            if (error) {
              console.error("Search error:", error);
              return [];
            }
            return data || [];
          })
        );
        rawResults = searchResults.flat();
      } else {
        // 分野のみの閲覧（キーワードなし）
        const { data, error } = await supabase
          .from("items")
          .select(ITEM_SELECT)
          .in("status", ["available", "trading"])
          .eq("is_demo", false)
          .in("isbn", isbnFilter!)
          .order("created_at", { ascending: false })
          .limit(50);
        rawResults = error ? [] : data || [];
      }

      // 重複を除去
      const seenIds = new Set<string>();
      const uniqueResults = rawResults.filter((item: any) => {
        if (seenIds.has(item.id)) return false;
        seenIds.add(item.id);
        return true;
      });

      const mappedResults = uniqueResults.map((item: any) => ({
        ...item,
        favorite_count: item.favorites?.[0]?.count || 0,
        favorites: undefined,
      })) as Item[];

      setResults(mappedResults);

      // 検索履歴の保存（キーワード検索時のみ）
      if (user && hasQuery) {
        (supabase.from("search_histories") as any)
          .insert({ user_id: user.id, keyword: trimmed })
          .then(() => {})
          .catch(() => {});
      }
    } catch (err) {
      console.error("Search error:", err);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  // キーワード検索（現在選択中の分野フィルタを引き継ぐ）
  const executeSearch = (query: string) => runSearch(query, selectedSchool, selectedDept);

  // 学院チップ: 選択/解除。系の選択はリセットして即検索。
  const handleSchoolSelect = (school: string) => {
    const next = selectedSchool === school ? null : school;
    setSearchMode("keyword");
    setSelectedSuggestion(null);
    setSelectedSchool(next);
    setSelectedDept(null);
    runSearch(searchQuery, next, null);
  };

  // 系チップ: 選択/解除して即検索。
  const handleDeptSelect = (dept: string) => {
    const next = selectedDept === dept ? null : dept;
    setSearchMode("keyword");
    setSelectedSuggestion(null);
    setSelectedDept(next);
    runSearch(searchQuery, selectedSchool, next);
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
              .select("id, title, isbn, front_image_url, front_thumbnail_url, front_image_storage_path, front_thumbnail_storage_path, image_storage_provider")
              .in("status", ["available", "trading"])
              .eq("is_demo", false)
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
            uniqueTitles.set(item.title, {
              id: item.id,
              title: item.title,
              isbn: item.isbn,
              front_image_url: item.front_image_url,
              front_thumbnail_url: item.front_thumbnail_url,
              front_image_storage_path: item.front_image_storage_path,
              front_thumbnail_storage_path: item.front_thumbnail_storage_path,
              image_storage_provider: item.image_storage_provider,
            });
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

  useEffect(() => {
    if (!hasSearched || isLoading) return;

    const query = searchQuery.trim();
    const selectedBook = searchMode === "selected_item" && selectedSuggestion
      ? selectedSuggestion
      : null;
    const textnextItems = selectedBook
      ? [selectedBook]
      : results;
    const textnextBooks = textnextItems
      .map((item: any) => ({
        id: item.id,
        title: item.title,
        isbn: item.isbn || null,
        imageUrl: getItemImageUrl(item, "front", "thumbnail"),
      }))
      .filter((item) => item.title && item.isbn);

    if (searchMode === "selected_item" && textnextBooks.length === 0) {
      setLibraryState({ loading: false, error: "", textnext: [], suggestions: [] });
      return;
    }

    if (searchMode === "keyword" && query.length <= 2 && textnextBooks.length === 0) {
      setLibraryState({ loading: false, error: "", textnext: [], suggestions: [] });
      return;
    }

    const seq = libraryRequestSeqRef.current + 1;
    libraryRequestSeqRef.current = seq;
    const debounceTimer = setTimeout(async () => {
      const mergeExternalBooks = (existing: LibraryBook[], incoming: LibraryBook[]) => {
        const map = new Map<string, LibraryBook>();
        for (const book of existing) map.set(book.isbn, book);
        for (const book of incoming) {
          if (!map.has(book.isbn)) map.set(book.isbn, book);
        }
        return Array.from(map.values()).slice(0, 8);
      };

      setLibraryState({
        loading: true,
        error: "",
        textnext: [],
        suggestions: [],
        errors: [],
      });

      try {
        let offset = 0;
        let hasMore = true;
        let textnextLibraryResults: LibraryBook[] = [];
        let externalLibraryResults: LibraryBook[] = [];
        let latestErrors: Array<{ source: string; message: string }> = [];
        let latestDebug: Record<string, unknown> | undefined;
        let latestFetchedAt: string | undefined;
        let latestProgress: LibraryState["progress"];

        while (hasMore && libraryRequestSeqRef.current === seq) {
          const response = await fetch("/api/library/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              query,
              mode: searchMode,
              textnextBooks: offset === 0 ? textnextBooks : [],
              externalOffset: offset,
              externalLimit: 12,
              externalTotalLimit: 63,
            }),
          });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error || "library_search_failed");
          if (libraryRequestSeqRef.current !== seq) return;

          if (offset === 0) {
            textnextLibraryResults = payload.textnextResults ?? payload.textnext ?? [];
          }
          externalLibraryResults = mergeExternalBooks(
            externalLibraryResults,
            payload.externalResults ?? payload.suggestions ?? []
          );
          latestErrors = payload.errors ?? [];
          latestDebug = payload.debug;
          latestFetchedAt = payload.fetchedAt;
          latestProgress = payload.progress;
          hasMore = Boolean(payload.progress?.externalHasMore);
          offset = Number(payload.progress?.externalCheckedCount ?? offset + 9);

          setLibraryState({
            loading: hasMore,
            error: "",
            textnext: textnextLibraryResults,
            suggestions: externalLibraryResults,
            errors: latestErrors,
            debug: latestDebug,
            fetchedAt: latestFetchedAt,
            progress: latestProgress,
          });

          if (searchMode === "selected_item") break;
          if (offset <= Number(payload.progress?.externalOffset ?? -1)) break;
        }
      } catch (err: any) {
        if (libraryRequestSeqRef.current !== seq) return;
        setLibraryState({
          loading: false,
          error: "図書館情報を取得できませんでした",
          textnext: [],
          suggestions: [],
          errors: [],
        });
      }
    }, 450);

    return () => clearTimeout(debounceTimer);
  }, [hasSearched, isLoading, results, searchMode, searchQuery, selectedSuggestion]);

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
      setSearchMode("keyword");
      setSelectedSuggestion(null);
      router.push(`/search?q=${encodeURIComponent(searchQuery)}`);
      executeSearch(searchQuery);
    }
  };

  const handleSuggestionClick = (suggestion: Suggestion) => {
    setSearchQuery(suggestion.title);
    setSearchMode("selected_item");
    setSelectedSuggestion(suggestion);
    router.push(`/search?q=${encodeURIComponent(suggestion.title)}`);
    executeSearch(suggestion.title);
  };

  const handleHistoryClick = (keyword: string) => {
    setSearchQuery(keyword);
    setSearchMode("keyword");
    setSelectedSuggestion(null);
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
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSearchMode("keyword");
                setSelectedSuggestion(null);
              }}
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

      {/* 分野フィルタ（学院＋系） */}
      {taxonomy.length > 0 && (
        <div className="px-6 pt-4 pb-3 border-b bg-white">
          <div className="flex items-center gap-2 mb-2">
            <SlidersHorizontal className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-semibold text-gray-700">分野で絞り込み</span>
            {selectedSchool && (
              <button
                type="button"
                onClick={() => handleSchoolSelect(selectedSchool)}
                className="ml-auto text-xs font-medium text-primary hover:underline"
              >
                クリア
              </button>
            )}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {taxonomy.map((t) => (
              <button
                key={t.school}
                type="button"
                onClick={() => handleSchoolSelect(t.school)}
                className={`flex-shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  selectedSchool === t.school
                    ? "bg-primary text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {t.school}
              </button>
            ))}
          </div>
          {selectedSchool && (
            <div className="flex gap-2 overflow-x-auto pb-1 mt-2 -mx-1 px-1">
              {taxonomy
                .find((t) => t.school === selectedSchool)
                ?.depts.map((d) => (
                  <button
                    key={d.dept}
                    type="button"
                    onClick={() => handleDeptSelect(d.dept)}
                    className={`flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      selectedDept === d.dept
                        ? "bg-primary/15 text-primary ring-1 ring-primary/40"
                        : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                    }`}
                  >
                    {d.dept_label}
                  </button>
                ))}
            </div>
          )}
        </div>
      )}

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
        {!isLoading && hasSearched && (
          <LibrarySearchSection
            state={libraryState}
            searchMode={searchMode}
            query={searchQuery}
          />
        )}
      </div>
    </div>
  );
}

function LibrarySearchSection({
  state,
  searchMode,
  query,
}: {
  state: LibraryState;
  searchMode: SearchMode;
  query: string;
}) {
  const queryLength = query.trim().length;
  const hasTextnext = state.textnext.length > 0;
  const hasSuggestions = state.suggestions.length > 0;
  const shouldShow =
    state.loading ||
    !!state.error ||
    hasTextnext ||
    hasSuggestions ||
    (searchMode === "keyword" && queryLength > 2 && state.fetchedAt);

  if (!shouldShow) return null;

  const showNotFound =
    !state.loading &&
    !state.error &&
    !hasTextnext &&
    !hasSuggestions &&
    searchMode === "keyword" &&
    queryLength > 2;

  return (
    <section className="mt-8 border-t border-gray-100 pt-6">
      <div className="mb-4 flex items-center gap-2">
        <BookOpen className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-black text-gray-900">大学図書館</h2>
      </div>

      {state.loading && (
        <div className="mb-4 flex items-center gap-2 rounded-2xl bg-gray-50 px-4 py-4 text-sm font-semibold text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {state.progress && state.progress.externalTotalCount > 0
            ? `関連する図書館候補を確認中... ${state.progress.externalCheckedCount} / ${state.progress.externalTotalCount}`
            : "読み込み中..."}
        </div>
      )}

      {!state.loading && state.error && (
        <div className="rounded-2xl bg-red-50 px-4 py-4 text-sm font-semibold text-red-700">
          {state.error}
        </div>
      )}

      {!state.error && state.errors && state.errors.length > 0 && (
        <div className="mb-4 rounded-2xl bg-yellow-50 px-4 py-3 text-xs font-semibold text-yellow-700">
          図書館情報の一部を取得できませんでした。
        </div>
      )}

      {!state.error && hasTextnext && (
        <div className="space-y-3">
          <h3 className="text-sm font-black text-gray-700">
            TextNextの検索結果に関連する本
          </h3>
          {state.textnext.map((book) => (
            <LibraryBookCard key={`textnext-${book.itemId || book.isbn}`} book={book} />
          ))}
        </div>
      )}

      {!state.error && hasSuggestions && (
        <div className={hasTextnext ? "mt-7 space-y-3" : "space-y-3"}>
          <h3 className="text-sm font-black text-gray-700">
            もしかして図書館ではこんな本が見つかりました
          </h3>
          {state.suggestions.map((book) => (
            <LibraryBookCard key={`external-${book.isbn}`} book={book} />
          ))}
        </div>
      )}

      {!state.loading && !state.error && state.progress?.externalCompleted && (hasSuggestions || hasTextnext) && (
        <p className="mt-4 text-center text-xs font-semibold text-gray-400">
          図書館候補の確認が完了しました
        </p>
      )}

      {showNotFound && (
        <div className="rounded-2xl bg-gray-50 px-4 py-4 text-sm font-semibold text-gray-500">
          大学図書館で関連する本は見つかりませんでした
        </div>
      )}
    </section>
  );
}

function LibraryBookCard({ book }: { book: LibraryBook }) {
  const hasStatuses = book.statuses.length > 0;

  return (
    <article className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex gap-3">
        <div className="h-20 w-14 flex-shrink-0 overflow-hidden rounded-xl border border-gray-100 bg-gray-50">
          {book.imageUrl ? (
            <img
              src={book.imageUrl}
              alt={book.title}
              className="h-full w-full object-cover"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <BookOpen className="h-5 w-5 text-gray-300" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="line-clamp-2 text-sm font-black leading-snug text-gray-900">
            {book.title}
          </h4>
          {(book.authors?.length || book.publisher) && (
            <p className="mt-1 truncate text-xs font-medium text-gray-500">
              {[book.authors?.join("、"), book.publisher].filter(Boolean).join(" / ")}
            </p>
          )}
          <p className="mt-1 text-[11px] font-semibold text-gray-400">ISBN: {book.isbn}</p>
          {book.source === "textnext" && book.textnextItemCount && book.textnextItemCount > 1 && (
            <p className="mt-1 text-[11px] font-black text-primary">
              TextNext出品: {book.textnextItemCount}件
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {hasStatuses ? (
          book.statuses.map((status) => (
            <span
              key={`${book.isbn}-${status.name}-${status.status}`}
              className={`rounded-full px-2.5 py-1 text-xs font-black ${
                status.available
                  ? "bg-green-50 text-green-700 ring-1 ring-green-100"
                  : "bg-yellow-50 text-yellow-700 ring-1 ring-yellow-100"
              }`}
            >
              {status.name}: {status.status}
            </span>
          ))
        ) : (
          <span className="rounded-full bg-gray-50 px-2.5 py-1 text-xs font-black text-gray-500 ring-1 ring-gray-100">
            蔵書なし
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold text-gray-400">
        <span>図書館情報: {formatLibraryFetchedAt(book.fetchedAt)}</span>
        {book.reserveUrl && (
          <a
            href={book.reserveUrl}
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            図書館で見る
          </a>
        )}
      </div>
    </article>
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
