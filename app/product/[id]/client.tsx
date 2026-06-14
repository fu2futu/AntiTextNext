"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ShoppingCart, X, Search, User, Star, GraduationCap, Heart, Pencil, Pause, Play, Trash2, Loader2, AlertTriangle, Check, MessageCircle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth-provider";
import { useI18n } from "@/lib/i18n";
import PurchaseModal from "@/components/PurchaseModal";
import { PurchaseData, generatePurchaseMessage } from "@/components/purchase-utils";
import { calculateSellingPrice } from "@/lib/utils";
import { LoginRequiredBubble, useLoginRequiredPrompt } from "@/components/login-required-prompt";
import { RewardAvatar, RewardBadges } from "@/components/reward-avatar";
import { getItemImageUrl } from "@/lib/image-storage";

export type Item = {
  id: string;
  title: string;
  description?: string | null;
  selling_price: number;
  original_price: number;
  //condition: string;
  status: string;
  front_image_url: string | null;
  back_image_url: string | null;
  front_thumbnail_url?: string | null;
  back_thumbnail_url?: string | null;
  front_image_storage_path?: string | null;
  back_image_storage_path?: string | null;
  front_thumbnail_storage_path?: string | null;
  back_thumbnail_storage_path?: string | null;
  image_storage_provider?: string | null;
  created_at: string;
  seller_id: string;
  seller_nickname?: string;
  seller_avatar_url?: string;
  is_demo?: boolean;
};

const APP_REVIEW_REAL_ITEM_BLOCK_MESSAGE =
  "この出品では購入リクエストを送信できません。ホームに表示されている出品から購入フローを確認してください。";

export default function ProductDetailClient({ item, isAppReviewDemo = false }: { item: Item; isAppReviewDemo?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetTransactionId = searchParams.get("tx");
  const { user } = useAuth();
  const { t } = useI18n();
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [isAcquiringLock, setIsAcquiringLock] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const frontImageUrl = getItemImageUrl(item, "front", "detail");
  const backImageUrl = getItemImageUrl(item, "back", "detail");
  const purchaseModalThumbnailUrl =
    getItemImageUrl(item, "front", "thumbnail") ||
    getItemImageUrl(item, "back", "thumbnail");
  const [isClosing, setIsClosing] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const isLockedRef = useRef(false);
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const favoriteStateRef = useRef(false);
  const favoriteSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loginPrompt = useLoginRequiredPrompt();

  // 出品者管理用 state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isManaging, setIsManaging] = useState(false);
  const [currentStatus, setCurrentStatus] = useState(item.status);
  const [hasCheckedActionState, setHasCheckedActionState] = useState(false);

  // 相談中の商品で、現在のユーザーが取引の当事者（出品者 or 相談中の購入者）かどうか。
  // 当事者ならチャットへ遷移できるようにし、それ以外の人は「相談中」表示のまま。
  const [isChatParticipant, setIsChatParticipant] = useState(false);
  const [chatTransactionId, setChatTransactionId] = useState<string | null>(null);

  // お気に入り状態を取得
  useEffect(() => {
    if (!user || !item) return;
    const checkFavorite = async () => {
      const { data } = await supabase
        .from("favorites")
        .select("id")
        .eq("user_id", user.id)
        .eq("item_id", item.id)
        .maybeSingle();
      setIsFavorite(!!data);
      favoriteStateRef.current = !!data;
    };
    checkFavorite();
  }, [user, item]);

  const toggleFavorite = async () => {
    if (!user) {
      loginPrompt.show();
      return;
    }

    const previous = favoriteStateRef.current;
    const next = !previous;
    favoriteStateRef.current = next;
    setIsFavorite(next);
    setFavoriteLoading(true);

    if (favoriteSyncTimerRef.current) {
      clearTimeout(favoriteSyncTimerRef.current);
    }

    favoriteSyncTimerRef.current = setTimeout(async () => {
      try {
        if (next) {
          await (supabase.from("favorites") as any)
            .upsert({ user_id: user.id, item_id: item.id }, { onConflict: "user_id,item_id" });
        } else {
          await (supabase.from("favorites") as any)
            .delete()
            .eq("user_id", user.id)
            .eq("item_id", item.id);
        }
      } catch (err) {
        console.error("Error toggling favorite:", err);
        if (favoriteStateRef.current === next) {
          favoriteStateRef.current = previous;
          setIsFavorite(previous);
        }
      } finally {
        if (favoriteStateRef.current === next) {
          setFavoriteLoading(false);
        }
      }
    }, 220);
  };

  useEffect(() => {
    isLockedRef.current = !!lockedUntil;
  }, [lockedUntil]);

  const handleReleaseLock = async () => {
    if (!user || !item) return;
    try {
      await (supabase as any).rpc("release_item_lock", {
        target_item_id: item.id,
        locker_id: user.id
      });
    } catch (err) {
      console.error("Error releasing lock:", err);
    }
  };

  useEffect(() => {
    setIsVisible(true);
    // モーダル表示時に背景のスクロールを固定
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
      document.body.classList.remove('hide-bottom-nav');
      if (isLockedRef.current) {
        handleReleaseLock();
      }
    };
  }, []);

  // モーダル状態に合わせてナビゲーションの表示を制御
  useEffect(() => {
    if (isPurchaseModalOpen) {
      document.body.classList.add('hide-bottom-nav');
    } else {
      document.body.classList.remove('hide-bottom-nav');
    }
  }, [isPurchaseModalOpen]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      router.back();
    }, 300);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  const handleOpenPurchaseModal = async () => {
    if (isAcquiringLock || isPurchaseModalOpen || isSubmitting || !isAvailable) return;
    if (!user) {
      router.push("/auth/login");
      return;
    }

    if (isAppReviewDemo && !item.is_demo) {
      alert(APP_REVIEW_REAL_ITEM_BLOCK_MESSAGE);
      return;
    }

    const tenMinutesLater = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    
    setIsAcquiringLock(true);
    try {
      // Attempt to acquire lock via RPC (more secure & bypasses RLS issues)
      const { data: success, error } = await (supabase as any).rpc("acquire_item_lock", {
        target_item_id: item.id,
        locker_id: user.id,
        lock_until: tenMinutesLater
      });

      if (error) throw error;

      if (!success) {
        alert("現在、他の方が手続き中です。1分後にもう一度お試しください。");
        return;
      }

      setLockedUntil(tenMinutesLater);
      setIsPurchaseModalOpen(true);
    } catch (err: any) {
      console.error("Error acquiring lock:", err);
      // Detailed error for debugging
      if (err.message?.includes('function acquire_item_lock') || err.message?.includes('column "locked_by" does not exist')) {
        alert("システムエラー：データベースの更新（マイグレーション）が未完了です。SQL Editorで最新のSQLを実行してください。");
      } else {
        alert("購入手続きの開始に失敗しました。時間をおいて再度お試しください。");
      }
    } finally {
      setIsAcquiringLock(false);
    }
  };

  const handleModalClose = () => {
    setIsPurchaseModalOpen(false);
    handleReleaseLock();
  };

  const handlePurchaseSubmit = async (data: PurchaseData) => {
    if (!user || !item || isSubmitting) return;

    setIsSubmitting(true);

    try {
      // Check purchase eligibility (cooldown & attempt limits)
      const { data: eligibility, error: eligError } = await (supabase as any)
        .rpc('check_purchase_eligibility', {
          p_buyer_id: user.id,
          p_item_id: item.id,
          p_seller_id: item.seller_id,
        });

      if (eligError) {
        console.error("Eligibility check error:", eligError);
        // If function doesn't exist yet, proceed without check
      } else if (eligibility && !eligibility.allowed) {
        if (eligibility.reason === 'max_attempts_reached') {
          alert("この商品へのリクエストは上限（2回）に達しました。");
        } else if (eligibility.reason === 'cooldown_active') {
          alert(`前回の辞退から24時間経過していません。あと約${eligibility.hours_remaining}時間後にお試しください。`);
        } else if (eligibility.reason === 'pending_request_exists') {
          alert("この商品への承認待ちリクエストが既にあります。");
        } else if (eligibility.reason === 'request_limit_reached') {
          alert("現在この商品には複数の購入希望があるため、新しいリクエストを受け付けていません。");
        } else if (eligibility.reason === 'active_transaction_exists') {
          alert("この商品はすでに相談中です。");
        } else if (eligibility.reason === 'seller_cannot_buy_own_item') {
          alert("自分の商品にはリクエストできません。");
        } else if (eligibility.reason === 'app_review_real_item_blocked') {
          alert(APP_REVIEW_REAL_ITEM_BLOCK_MESSAGE);
        } else if (eligibility.reason === 'demo_item_only') {
          alert("この商品は現在、購入リクエストを受け付けていません。");
        }
        setIsSubmitting(false);
        return;
      }

      const autoMessage = generatePurchaseMessage(data);
      const { data: createdTransactionId, error: purchaseError } = await (supabase as any).rpc("submit_purchase_request", {
        target_item_id: item.id,
        payment_method: data.paymentMethod,
        meetup_time_slots: data.timeSlots,
        meetup_locations: data.locations,
        auto_message: autoMessage,
      });

      if (purchaseError) throw purchaseError;

      // メール通知APIの呼び出し（エラーが起きてもブロックしない）
      try {
        await fetch("/api/notify/transaction", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "request",
            itemId: item.id,
            receiverId: item.seller_id,
            extraData: { transactionId: createdTransactionId },
          }),
        });
      } catch (notifyErr) {
        console.error("Failed to trigger notify API:", notifyErr);
      }

      setIsPurchaseModalOpen(false);
      router.push(createdTransactionId ? `/chat/${item.id}?tx=${createdTransactionId}` : `/chat/${item.id}`);
    } catch (err: any) {
      console.error("Error submitting purchase request:", err);
      alert("購入リクエストの送信に失敗しました: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isOwnItem = user?.id === item.seller_id;
  const isSold = currentStatus === "sold";
  const isPending = currentStatus === "transaction_pending" || currentStatus === "trading";
  const isReserved = currentStatus === "reserved";
  const isAvailable = currentStatus === "available";
  const isRealItemBlockedForAppReview = isAppReviewDemo && item.is_demo !== true;

  // 購入手続き中の一時ロックだけはブロックする。相談中の商品は詳細閲覧のみ許可する。
  const isReservedByOther = isReserved && !isOwnItem;

  // 相談中のとき、現在のユーザーがこの商品の取引当事者（出品者 or 相談中の購入者）か確認する。
  // 商品詳細は短時間キャッシュされるため、購入リクエスト直後に古い available 表示が来ることがある。
  // その状態で編集/停止/削除が一瞬出ないよう、現在の status と取引参加状態を確認するまで出品者操作は出さない。
  useEffect(() => {
    setHasCheckedActionState(false);

    if (!user) {
      setIsChatParticipant(false);
      setChatTransactionId(null);
      setHasCheckedActionState(true);
      return;
    }

    let cancelled = false;
    const checkParticipation = async () => {
      try {
        let transactionQuery = (supabase as any)
          .from("transactions")
          .select("id, status, created_at")
          .eq("item_id", item.id)
          .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
          .order("created_at", { ascending: false });

        if (targetTransactionId) {
          transactionQuery = transactionQuery.eq("id", targetTransactionId);
        }

        const [{ data: liveItem }, { data, error }] = await Promise.all([
          (supabase as any)
            .from("items")
            .select("status")
            .eq("id", item.id)
            .maybeSingle(),
          transactionQuery,
        ]);

        if (cancelled) return;

        const liveStatus = liveItem?.status || item.status;
        if (liveItem?.status) {
          setCurrentStatus(liveItem.status);
        }

        // 相談中は未終了取引を優先。過去取引から開いた場合は tx 指定の終了済み取引も許可する。
        const TERMINAL_STATUSES = ["cancelled", "rejected", "declined", "expired", "auto_closed", "completed"];
        const activeTx = !error && Array.isArray(data)
          ? (targetTransactionId
            ? (data as any[])[0]
            : (data as any[]).find((tx) => !TERMINAL_STATUSES.includes(tx.status)) || (liveStatus === "sold" ? (data as any[])[0] : null))
          : null;

        setIsChatParticipant(!!activeTx);
        setChatTransactionId(activeTx?.id ?? null);
        setHasCheckedActionState(true);
      } catch (err) {
        console.error("Error checking product action state:", err);
        if (!cancelled) {
          setIsChatParticipant(false);
          setChatTransactionId(null);
          // 出品者本人の場合は安全側に倒し、編集/停止/削除ボタンを表示しない。
          setHasCheckedActionState(user.id !== item.seller_id);
        }
      }
    };

    checkParticipation();
    return () => {
      cancelled = true;
    };
  }, [user, item.id, item.seller_id, targetTransactionId]);

  const chatHref = chatTransactionId
    ? `/chat/${item.id}?tx=${chatTransactionId}`
    : `/chat/${item.id}`;
  const shouldShowChatButton = isChatParticipant && (isPending || isSold || !!targetTransactionId);

  const scrollToImage = (index: number) => {
    const carousel = carouselRef.current;
    if (!carousel) return;

    carousel.scrollTo({
      left: index * carousel.offsetWidth,
      behavior: "smooth",
    });
    setActiveImageIndex(index);
  };

  // If item is reserved by another user, show blocked message
  if (isReservedByOther) {
    return (
      <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full text-center animate-[slideUp_0.3s_ease-out]">
          <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShoppingCart className="w-8 h-8 text-yellow-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            {isPending ? "相談中" : "予約済み"}
          </h2>
          <p className="text-gray-600 mb-6">
            {isPending
              ? "この商品は現在ほかの方と相談中です。"
              : "この商品は他のユーザーが購入手続き中です。しばらくお待ちください。"
            }
          </p>
          <Link
            href="/"
            className="block w-full py-3 bg-primary text-white rounded-xl font-semibold hover:bg-primary/90 transition-all"
          >
            ホームに戻る
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[70]" onClick={handleBackdropClick}>
      {/* Backdrop */}
      <div 
        className={`absolute inset-0 bg-black transition-opacity duration-300 ${
          isVisible && !isClosing ? 'opacity-50' : 'opacity-0'
        }`}
        onClick={handleClose}
      />
      
      {/* Modal Content - Bottom Sheet */}
      <div 
        className={`absolute inset-x-0 bottom-0 top-[calc(var(--app-top-offset)+var(--product-detail-top-gap))] bg-white rounded-t-3xl shadow-2xl overflow-hidden transition-transform duration-300 ease-out md:left-1/2 md:right-auto md:top-[calc(var(--app-top-offset)+var(--product-detail-desktop-top-gap))] md:bottom-8 md:w-[min(1120px,calc(100vw-4rem))] md:-translate-x-1/2 md:rounded-3xl ${
          isVisible && !isClosing ? 'translate-y-0' : 'translate-y-full md:translate-y-8'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white z-10 px-6 pt-4 pb-3 border-b flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={handleClose}
              className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors"
              aria-label="戻る"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <h1 className="text-lg font-bold text-gray-900">商品詳細</h1>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="閉じる"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        
        {/* Scrollable content */}
        <div className="overflow-y-auto h-[calc(100%-130px)] px-6 py-6 md:h-[calc(100%-148px)] md:overflow-hidden md:px-8 md:py-6">
          <div className="max-w-4xl mx-auto md:grid md:h-full md:max-w-none md:grid-cols-[minmax(0,1fr)_minmax(360px,430px)] md:gap-6">
            {/* Images - Swipe Carousel */}
            {(frontImageUrl || backImageUrl) && (() => {
              const images = [
                frontImageUrl ? { url: frontImageUrl, label: "表紙" } : null,
                backImageUrl ? { url: backImageUrl, label: "裏表紙" } : null,
              ].filter(Boolean) as { url: string; label: string }[];

              return (
                <div className="mb-6 md:mb-0 md:min-h-0">
                  <div className="grid grid-cols-2 gap-3 md:hidden">
                    {images.map((img, idx) => (
                      <button
                        key={img.label}
                        type="button"
                        onClick={() => setZoomedImage(img.url)}
                        className="group relative overflow-hidden rounded-xl bg-gray-100 shadow-sm ring-1 ring-gray-200"
                      >
                        <div className="relative aspect-[3/4]">
                          <Image
                            src={img.url}
                            alt={`${item.title} ${img.label}`}
                            fill
                            sizes="45vw"
                            className="object-cover"
                            loading={idx === 0 ? "eager" : "lazy"}
                            quality={65}
                          />
                        </div>
                        <span className="absolute bottom-2 left-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
                          {img.label}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div
                    className="relative hidden overflow-hidden rounded-2xl bg-gray-100 md:block md:h-full"
                    onTouchStart={(e) => {
                      const t = e.currentTarget as any;
                      t._touchStartX = e.touches[0].clientX;
                      t._touchStartTime = Date.now();
                    }}
                    onTouchEnd={(e) => {
                      const t = e.currentTarget as any;
                      if (!t._touchStartX) return;
                      const diff = e.changedTouches[0].clientX - t._touchStartX;
                      const elapsed = Date.now() - (t._touchStartTime || 0);
                      // Swipe threshold: 50px or fast swipe
                      if (Math.abs(diff) > 50 || (Math.abs(diff) > 20 && elapsed < 250)) {
                        const carousel = t.querySelector('[data-carousel]');
                        if (!carousel) return;
                        const currentIdx = Math.round(carousel.scrollLeft / carousel.offsetWidth);
                        const nextIdx = diff < 0
                          ? Math.min(currentIdx + 1, images.length - 1)
                          : Math.max(currentIdx - 1, 0);
                        carousel.scrollTo({ left: nextIdx * carousel.offsetWidth, behavior: 'smooth' });
                      }
                      t._touchStartX = null;
                    }}
                  >
                    <div
                      ref={carouselRef}
                      data-carousel
                      className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide md:h-full"
                      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
                      onScroll={(e) => {
                        const el = e.currentTarget;
                        const idx = Math.round(el.scrollLeft / el.offsetWidth);
                        setActiveImageIndex(idx);
                      }}
                    >
                      {images.map((img, idx) => (
                        <div
                          key={idx}
                          className="flex-none w-full snap-center md:h-full"
                        >
                          <div
                            className="relative aspect-[3/4] cursor-zoom-in group md:h-full md:aspect-auto"
                            onClick={() => setZoomedImage(img.url)}
                          >
                            <Image
                              src={img.url}
                              alt={`${item.title} ${img.label}`}
                              fill
                              sizes="(max-width: 768px) 90vw, 600px"
                              className="object-contain transition-transform duration-500 group-hover:scale-105"
                              loading={idx === 0 ? "eager" : "lazy"}
                              quality={70}
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/20 backdrop-blur-md p-2 rounded-full">
                                <Search className="w-5 h-5 text-white" />
                              </div>
                            </div>
                            {/* Image label */}
                            <div className="absolute bottom-3 left-3 bg-black/50 backdrop-blur-sm text-white text-xs font-bold px-3 py-1 rounded-full">
                              {img.label}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Front/back selector */}
                    {images.length > 1 && (
                      <div className="absolute left-3 right-3 top-3 z-10 flex rounded-2xl bg-black/35 p-1 backdrop-blur-md">
                        {images.map((img, idx) => (
                          <button
                            key={img.label}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              scrollToImage(idx);
                            }}
                            className={`flex-1 rounded-xl px-3 py-2 text-xs font-black transition-all ${
                              activeImageIndex === idx
                                ? "bg-white text-gray-900 shadow-sm"
                                : "text-white/85 hover:bg-white/15"
                            }`}
                          >
                            {img.label}
                          </button>
                        ))}
                      </div>
                    )}
                    {/* Dot Indicators */}
                    {images.length > 1 && (
                      <div className="absolute bottom-3 right-3 flex items-center gap-1.5">
                        {images.map((_, idx) => (
                          <div
                            key={idx}
                            data-dot
                            className="h-2 rounded-full bg-white shadow-sm transition-all duration-300"
                            style={{
                              width: idx === activeImageIndex ? '20px' : '8px',
                              opacity: idx === activeImageIndex ? 1 : 0.4,
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Product Info */}
            <div className="bg-white rounded-2xl shadow-lg border p-6 md:min-h-0 md:overflow-y-auto md:p-5">
              <h2 className="text-2xl font-bold text-gray-900 mb-4 md:text-[1.7rem] md:leading-tight">{item.title}</h2>

              {(isSold || isPending) && (
                <div className={`inline-block px-3 py-1 rounded-full text-sm font-semibold mb-4 ${
                  isSold ? "bg-gray-200 text-gray-600" : "bg-yellow-100 text-yellow-700"
                }`}>
                  {isSold ? "売り切れ" : "相談中"}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-600 mb-2">価格</h3>
                  <p className="text-3xl font-bold text-primary">
                    ¥{item.selling_price.toLocaleString()}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    定価: ¥{item.original_price.toLocaleString()}
                  </p>
                </div>

                {item.description && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-600 mb-2">商品説明</h3>
                    <p className="whitespace-pre-wrap rounded-2xl bg-gray-50 px-4 py-3 text-sm font-medium leading-6 text-gray-800">
                      {item.description}
                    </p>
                  </div>
                )}

                <div>
                  <h3 className="text-sm font-medium text-gray-600 mb-2">出品者</h3>
                  <div className="bg-gray-50 rounded-2xl border border-gray-100 p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/seller/${item.seller_id}`}
                        className="group transition-all"
                      >
                      <RewardAvatar
                        src={item.seller_avatar_url}
                        alt={item.seller_nickname || "出品者"}
                        size={48}
                        listingCount={(item as any).seller_listing_count ?? 0}
                        earlyRegistration={(item as any).seller_early_registration}
                        className="group-hover:scale-105 transition-transform"
                      />
                      </Link>
                      <div className="flex-1 min-w-0">
                        <Link href={`/seller/${item.seller_id}`} className="flex items-center gap-2 group">
                          <span className="text-lg font-bold text-gray-900 group-hover:text-primary transition-colors truncate">
                            {item.seller_nickname || "匿名"}
                          </span>
                        </Link>
                        <RewardBadges badges={(item as any).seller_badges} />
                        {(item as any).seller_rating !== undefined && (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <div className="flex text-yellow-500">
                              {[...Array(5)].map((_, i) => (
                                <Star 
                                  key={i} 
                                  className={`w-3.5 h-3.5 ${i < Math.round((item as any).seller_rating || 0) ? "fill-current" : "text-gray-200"}`} 
                                />
                              ))}
                            </div>
                            <span className="text-xs font-bold text-gray-500">
                              {(item as any).seller_listing_count ?? 0}件出品
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="pt-2 border-t border-gray-200/60 space-y-1">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <GraduationCap className="w-4 h-4 text-primary/60" />
                        <span className="font-medium">{(item as any).seller_department || "不明"}</span>
                      </div>
                      {(item as any).seller_major && (
                        <div className="flex items-center gap-2 text-sm text-gray-600 pl-6">
                          <span className="text-xs bg-primary/5 text-primary px-2 py-0.5 rounded-md font-bold">{(item as any).seller_major}</span>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-2 pt-2">
                        <div className="rounded-xl bg-white px-3 py-2 text-center">
                          <p className="text-[10px] font-black text-gray-400">出品数</p>
                          <p className="text-sm font-black text-gray-900">{(item as any).seller_listing_count ?? 0}件</p>
                        </div>
                        <div className="rounded-xl bg-white px-3 py-2 text-center">
                          <p className="text-[10px] font-black text-gray-400">取引数</p>
                          <p className="text-sm font-black text-gray-900">{(item as any).seller_transaction_count ?? 0}件</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-gray-600 mb-2">出品日</h3>
                  <p className="text-gray-900 font-medium">
                    {new Date(item.created_at).toLocaleDateString("ja-JP", { year: 'numeric', month: 'long', day: 'numeric' })}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons - Fixed at bottom of modal */}
        <div className="absolute bottom-0 left-0 right-0 bg-white border-t px-5 pt-3 z-[80] md:px-6 md:py-4" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
          <div className="max-w-4xl mx-auto flex gap-3">
            {shouldShowChatButton ? (
              <Link
                href={chatHref}
                className="flex-1 py-3 md:py-4 bg-primary text-white rounded-xl font-semibold hover:bg-primary/90 transition-all shadow-md flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-5 h-5" />
                チャットを見る
              </Link>
            ) : isOwnItem && isRealItemBlockedForAppReview ? (
              <button
                type="button"
                disabled
                className="flex-1 py-3 md:py-4 bg-gray-100 text-gray-500 rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
              >
                <AlertTriangle className="w-5 h-5" />
                この出品では購入できません
              </button>
            ) : isOwnItem && !hasCheckedActionState ? (
              <button
                type="button"
                disabled
                className="flex-1 py-3 md:py-4 bg-gray-100 text-gray-500 rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
              >
                <Loader2 className="w-5 h-5 animate-spin" />
                取引状態を確認中
              </button>
            ) : isOwnItem && isPending ? (
              <button
                type="button"
                disabled
                className="flex-1 py-3 md:py-4 bg-gray-100 text-gray-500 rounded-xl font-semibold transition-all flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-5 h-5" />
                取引中です
              </button>
            ) : isOwnItem ? (
              <div className="flex gap-2 flex-1">
                <button
                  onClick={() => setIsEditModalOpen(true)}
                  disabled={currentStatus === 'sold' || currentStatus === 'transaction_pending' || currentStatus === 'trading'}
                  className="flex-1 py-3 md:py-3.5 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1.5 text-sm"
                >
                  <Pencil className="w-4 h-4" />
                  {t('product.edit')}
                </button>
                <button
                  onClick={async () => {
                    if (isManaging) return;
                    setIsManaging(true);
                    try {
                      const newStatus = currentStatus === 'paused' ? 'available' : 'paused';
                      const { error } = await (supabase.from('items') as any)
                        .update({ status: newStatus })
                        .eq('id', item.id)
                        .eq('seller_id', user?.id);
                      if (error) throw error;
                      setCurrentStatus(newStatus);
                    } catch (err: any) {
                      alert('ステータスの変更に失敗しました');
                    } finally {
                      setIsManaging(false);
                    }
                  }}
                  disabled={isManaging || currentStatus === 'sold' || currentStatus === 'transaction_pending' || currentStatus === 'trading'}
                  className={`py-3 md:py-3.5 px-3 md:px-4 rounded-xl font-bold transition-all flex items-center justify-center gap-1.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed ${
                    currentStatus === 'paused'
                      ? 'bg-green-500 text-white hover:bg-green-600'
                      : 'bg-yellow-500 text-white hover:bg-yellow-600'
                  }`}
                >
                  {isManaging ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : currentStatus === 'paused' ? (
                    <><Play className="w-4 h-4" />{t('product.resume')}</>
                  ) : (
                    <><Pause className="w-4 h-4" />{t('product.pause')}</>
                  )}
                </button>
                <button
                  onClick={() => setIsDeleteModalOpen(true)}
                  disabled={currentStatus === 'transaction_pending' || currentStatus === 'trading'}
                  className="py-3 md:py-3.5 px-3 md:px-4 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center text-sm"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                <div className="relative flex-shrink-0">
                <LoginRequiredBubble visible={loginPrompt.visible} />
                <button
                  onClick={toggleFavorite}
                  className={`w-12 h-12 md:w-14 md:h-14 flex-shrink-0 flex items-center justify-center rounded-xl border-2 transition-all active:scale-90 ${
                    isFavorite
                      ? "border-red-200 bg-red-50"
                      : "border-gray-200 bg-white hover:border-red-200 hover:bg-red-50"
                  }`}
                  aria-label="お気に入り"
                >
                  <Heart
                    className={`w-6 h-6 transition-colors ${
                      isFavorite
                        ? "fill-red-500 text-red-500"
                        : "text-gray-400"
                    }`}
                  />
                </button>
                </div>
                <button
                  onClick={handleOpenPurchaseModal}
                  disabled={!isAvailable || isAcquiringLock || isSubmitting}
                  className="flex-1 py-3 md:py-4 bg-primary text-white rounded-xl font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md flex items-center justify-center gap-2"
                >
                  <ShoppingCart className="w-5 h-5" />
                  {isAcquiringLock ? "確認中..." : isSold ? t('product.sold') : isPending ? "相談中" : t('product.buy')}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Zoomed Image Overlay */}
      {zoomedImage && (
        <div 
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 md:p-12 animate-[fadeIn_0.3s_ease-out]"
          onClick={() => setZoomedImage(null)}
        >
          <button 
            className="absolute top-12 right-6 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors z-[110]"
            onClick={() => setZoomedImage(null)}
          >
            <X className="w-8 h-8" />
          </button>
          <div 
            className="relative w-full h-full max-w-4xl max-h-[90vh] flex items-center justify-center overflow-hidden animate-[pinchOut_0.4s_cubic-bezier(0.34,1.56,0.64,1)]"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={zoomedImage}
              alt="拡大画像"
              fill
              className="object-contain"
              quality={100}
              priority
            />
          </div>
        </div>
      )}

      {/* Purchase Modal */}
      <PurchaseModal
        isOpen={isPurchaseModalOpen}
        onClose={handleModalClose}
        onSubmit={handlePurchaseSubmit}
        itemTitle={item.title}
        lockedUntil={lockedUntil}
        itemThumbnailUrl={purchaseModalThumbnailUrl}
      />

      {/* Edit Modal */}
      {isEditModalOpen && (
        <EditItemModal
          item={item}
          onClose={() => setIsEditModalOpen(false)}
          onSave={async (title: string, originalPrice: number) => {
            setIsManaging(true);
            try {
              const sellingPrice = calculateSellingPrice(originalPrice);
              const { error } = await (supabase.from('items') as any)
                .update({
                  title,
                  original_price: originalPrice,
                  selling_price: sellingPrice,
                })
                .eq('id', item.id)
                .eq('seller_id', user?.id);
              if (error) throw error;
              // Refresh page to show updated data
              window.location.reload();
            } catch (err: any) {
              alert('更新に失敗しました: ' + err.message);
            } finally {
              setIsManaging(false);
            }
          }}
          isSubmitting={isManaging}
        />
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <DeleteConfirmModal
          onClose={() => setIsDeleteModalOpen(false)}
          onConfirm={async () => {
            setIsManaging(true);
            try {
              const response = await fetch("/api/items/purge-owned", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ itemId: item.id }),
              });
              const result = await response.json().catch(() => ({}));
              if (!response.ok) {
                throw new Error(result.error || "削除に失敗しました");
              }
              router.push('/profile');
            } catch (err: any) {
              alert('削除に失敗しました: ' + err.message);
            } finally {
              setIsManaging(false);
            }
          }}
          isSubmitting={isManaging}
        />
      )}
    </div>
  );
}

// --- Edit Item Modal ---
function EditItemModal({
  item,
  onClose,
  onSave,
  isSubmitting
}: {
  item: { title: string; original_price: number };
  onClose: () => void;
  onSave: (title: string, originalPrice: number) => void;
  isSubmitting: boolean;
}) {
  const [title, setTitle] = useState(item.title);
  const [originalPrice, setOriginalPrice] = useState(String(item.original_price));
  const sellingPrice = originalPrice ? calculateSellingPrice(Number(originalPrice)) : 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 animate-in fade-in duration-300">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-5 duration-300">
        <div className="p-8">
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-6 mx-auto">
            <Pencil className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-xl font-black text-gray-900 text-center mb-6">出品情報を編集</h2>

          <div className="space-y-4 mb-6">
            <div>
              <label className="text-sm font-bold text-gray-600 mb-1 block">教科書名</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary transition-colors font-medium"
              />
            </div>
            <div>
              <label className="text-sm font-bold text-gray-600 mb-1 block">定価（円）</label>
              <input
                type="number"
                value={originalPrice}
                onChange={(e) => setOriginalPrice(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary transition-colors font-medium"
              />
            </div>
            {sellingPrice > 0 && (
              <div className="bg-primary/5 rounded-xl p-3 text-center">
                <span className="text-xs text-gray-500">販売価格: </span>
                <span className="text-lg font-black text-primary">¥{sellingPrice.toLocaleString()}</span>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <button
              onClick={() => {
                if (!title.trim() || !originalPrice) return;
                onSave(title.trim(), Number(originalPrice));
              }}
              disabled={!title.trim() || !originalPrice || isSubmitting}
              className="w-full bg-primary text-white py-4 rounded-2xl font-black shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Check className="w-5 h-5" />保存する</>}
            </button>
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="w-full bg-gray-100 text-gray-400 py-4 rounded-2xl font-black hover:bg-gray-200 transition-all active:scale-[0.98]"
            >
              キャンセル
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Delete Confirm Modal ---
function DeleteConfirmModal({
  onClose,
  onConfirm,
  isSubmitting
}: {
  onClose: () => void;
  onConfirm: () => void;
  isSubmitting: boolean;
}) {
  const [confirmed, setConfirmed] = useState(false);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 animate-in fade-in duration-300">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-5 duration-300">
        <div className="p-8">
          <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mb-6 mx-auto">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-xl font-black text-gray-900 text-center mb-2">出品を削除しますか？</h2>
          <p className="text-gray-500 text-sm text-center mb-6 font-medium">
            この操作は取り消せません。取引がない出品のみ、画像やお気に入り情報を含めて完全に削除されます。
          </p>

          <button
            onClick={() => setConfirmed(!confirmed)}
            className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition-all mb-6 ${
              confirmed ? "border-red-400 bg-red-50" : "border-gray-200 bg-white"
            }`}
          >
            <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
              confirmed ? "bg-red-500 border-red-500" : "bg-white border-gray-300"
            }`}>
              {confirmed && <Check className="w-4 h-4 text-white" strokeWidth={3} />}
            </div>
            <span className={`text-sm font-bold ${confirmed ? "text-red-600" : "text-gray-500"}`}>
              削除することを確認しました
            </span>
          </button>

          <div className="space-y-3">
            <button
              onClick={onConfirm}
              disabled={!confirmed || isSubmitting}
              className={`w-full py-4 rounded-2xl font-black shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${
                confirmed && !isSubmitting
                  ? "bg-red-500 text-white shadow-red-500/20 hover:bg-red-600"
                  : "bg-gray-100 text-gray-400 shadow-none cursor-not-allowed"
              }`}
            >
              {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Trash2 className="w-5 h-5" />削除する</>}
            </button>
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="w-full bg-gray-100 text-gray-400 py-4 rounded-2xl font-black hover:bg-gray-200 transition-all active:scale-[0.98]"
            >
              キャンセル
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
