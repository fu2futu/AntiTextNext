"use client";

import Link from "next/link";
import { ArrowLeft, User, GraduationCap, Heart, Star, Image as ImageIcon, Camera, Pencil, X, Loader2, Eye, ImagePlus } from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth-provider";
import { RewardAvatar, RewardBadges } from "@/components/reward-avatar";
import { resolveEarlyRegistrationEligible, type RewardOverride, type RewardSetting, type UserBadge } from "@/lib/rewards";
import { ALLOWED_IMAGE_ACCEPT, ALLOWED_IMAGE_MIME_TYPES, getItemImageUrl } from "@/lib/image-storage";
import { LoginRequiredBubble, useLoginRequiredPrompt } from "@/components/login-required-prompt";

type SellerProfile = {
    user_id: string;
    nickname: string;
    department: string;
    major?: string;
    avatar_url?: string | null;
    is_deactivated?: boolean;
    created_at?: string | null;
};

type Item = {
    id: string;
    title: string;
    selling_price: number;
    front_thumbnail_url?: string | null;
    front_image_url: string | null;
    front_image_storage_path?: string | null;
    front_thumbnail_storage_path?: string | null;
    image_storage_provider?: string | null;
};

export default function SellerDetailPage({
    params,
}: {
    params: { id: string };
}) {
    const { user, refreshAvatar } = useAuth();
    const [profile, setProfile] = useState<SellerProfile | null>(null);
    const [items, setItems] = useState<Item[]>([]);
    const [loading, setLoading] = useState(true);
    const [favorites, setFavorites] = useState<string[]>([]);
    const [loginPromptItemId, setLoginPromptItemId] = useState<string | null>(null);
    const [averageRating, setAverageRating] = useState(0);
    const [listingCount, setListingCount] = useState(0);
    const [transactionCount, setTransactionCount] = useState(0);
    const [rewardSetting, setRewardSetting] = useState<RewardSetting | null>(null);
    const [rewardOverride, setRewardOverride] = useState<RewardOverride | null>(null);
    const [badges, setBadges] = useState<UserBadge[]>([]);
    const loadedRef = useRef(false);

    // アバター編集関連
    const isOwnPage = user?.id === params.id;
    const [showAvatarMenu, setShowAvatarMenu] = useState(false);
    const [showAvatarPreview, setShowAvatarPreview] = useState(false);
    const [showAvatarUpload, setShowAvatarUpload] = useState(false);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [avatarError, setAvatarError] = useState("");
    const avatarFileRef = useRef<HTMLInputElement>(null);
    const loginPrompt = useLoginRequiredPrompt();

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user) return;

        if (!ALLOWED_IMAGE_MIME_TYPES.has(file.type)) {
            setAvatarError("アップロードできる画像は JPG / PNG / WebP のみです");
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            setAvatarError("ファイルサイズは2MB以下にしてください");
            return;
        }

        setUploadingAvatar(true);
        setAvatarError("");

        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${user.id}/avatar.${fileExt}`;

            const { error: uploadError } = await supabase.storage
                .from('item-images')
                .upload(fileName, file, { upsert: true });
            if (uploadError) throw uploadError;

            const { data: urlData } = supabase.storage
                .from('item-images')
                .getPublicUrl(fileName);

            const newAvatarUrl = urlData.publicUrl + `?t=${Date.now()}`;

            const { error: updateError } = await (supabase
                .from("profiles") as any)
                .update({ avatar_url: newAvatarUrl })
                .eq("user_id", user.id);
            if (updateError) throw updateError;

            // ローカルの状態を更新
            setProfile(prev => prev ? { ...prev, avatar_url: newAvatarUrl } : prev);
            refreshAvatar();
            setShowAvatarUpload(false);
        } catch (err: any) {
            console.error("Error uploading avatar:", err);
            setAvatarError("画像のアップロードに失敗しました: " + err.message);
        } finally {
            setUploadingAvatar(false);
        }
    };

    useEffect(() => {
        // 重複リクエスト防止
        if (loadedRef.current) return;
        loadedRef.current = true;
        loadSellerData();
    }, [params.id]);

    const loadSellerData = async () => {
        try {
            // プロフィールを最優先で取得
            const { data: profileData, error: profileError } = await supabase
                .from("profiles")
                .select("user_id, nickname, department, major, avatar_url, is_deactivated, created_at")
                .eq("user_id", params.id)
                .single();

            if (profileError || !profileData) {
                console.error("Error loading profile:", profileError);
                setLoading(false);
                return;
            }

            setProfile(profileData as SellerProfile);

            // プロフィールが見つかったら、残りのデータを並列取得（個別に失敗しても止まらない）
            const [itemsResult, listingCountResult, ratingsResult, transactionsResult, rewardSettingResult, badgesResult, rewardOverrideResult] = await Promise.allSettled([
                supabase
                    .from("items")
                    .select("id, title, selling_price, front_image_url, front_thumbnail_url, front_image_storage_path, front_thumbnail_storage_path, image_storage_provider")
                    .eq("seller_id", params.id)
                    .eq("status", "available")
                    .order("created_at", { ascending: false }),
                supabase
                    .from("items")
                    .select("*", { count: "exact", head: true })
                    .eq("seller_id", params.id)
                    .neq("status", "deleted"),
                supabase
                    .from("ratings")
                    .select("score")
                    .eq("rated_id", params.id),
                supabase
                    .from("transactions")
                    .select("*", { count: "exact", head: true })
                    .eq("seller_id", params.id)
                    .eq("status", "completed"),
                (supabase as any)
                    .from("reward_settings")
                    .select("*")
                    .eq("id", "early_registration")
                    .single(),
                (supabase as any)
                    .from("user_badges")
                    .select("id,badge_type,badge_color,label,note")
                    .eq("user_id", params.id)
                    .is("revoked_at", null)
                    .order("created_at", { ascending: false }),
                (supabase as any)
                    .from("user_reward_overrides")
                    .select("early_registration_override")
                    .eq("user_id", params.id)
                    .maybeSingle()
            ]);

            // アイテム（0件でもOK）
            if (itemsResult.status === 'fulfilled' && !itemsResult.value.error) {
                setItems((itemsResult.value.data as Item[]) || []);
            }

            if (listingCountResult.status === 'fulfilled') {
                setListingCount(listingCountResult.value.count || 0);
            }

            // 評価
            if (ratingsResult.status === 'fulfilled' && ratingsResult.value.data) {
                const scores = (ratingsResult.value.data as any[]).map(r => r.score);
                const count = scores.length;
                const avg = count > 0 ? scores.reduce((a, b) => a + b, 0) / count : 0;
                setAverageRating(avg);
            }

            // 取引数
            if (transactionsResult.status === 'fulfilled') {
                setTransactionCount(transactionsResult.value.count || 0);
            }

            // リワード設定
            if (rewardSettingResult.status === 'fulfilled') {
                setRewardSetting(rewardSettingResult.value.data || null);
            }

            // リワードオーバーライド
            if (rewardOverrideResult.status === 'fulfilled') {
                setRewardOverride(rewardOverrideResult.value.data || null);
            }

            // バッジ
            if (badgesResult.status === 'fulfilled') {
                setBadges((badgesResult.value.data || []) as UserBadge[]);
            }
        } catch (err) {
            console.error("Error loading seller data:", err);
        } finally {
            setLoading(false);
        }
    };

    const toggleFavorite = useCallback((id: string) => {
        if (!user) {
            setLoginPromptItemId(id);
            loginPrompt.show();
            return;
        }

        setFavorites((prev) =>
            prev.includes(id) ? prev.filter((fav) => fav !== id) : [...prev, id]
        );
    }, [user, loginPrompt]);

    if (loading) {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                    <p className="text-gray-400 font-bold">読み込み中...</p>
                </div>
            </div>
        );
    }

    if (!profile) {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center">
                <div className="text-center p-8">
                    <p className="text-gray-600 mb-6 text-xl font-bold">出品者が見つかりませんでした</p>
                    <Link href="/" className="inline-block px-8 py-3 bg-primary text-white rounded-2xl font-bold shadow-lg shadow-primary/20 transition-all active:scale-95">
                        ホームに戻る
                    </Link>
                </div>
            </div>
        );
    }

    if (profile.is_deactivated) {
        return (
            <div className="min-h-screen bg-gradient-to-b from-white to-gray-50 flex items-center justify-center">
                <div className="text-center p-8 max-w-sm">
                    <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <User className="w-10 h-10 text-gray-300" />
                    </div>
                    <h2 className="text-xl font-bold text-gray-700 mb-3">退会済みユーザー</h2>
                    <p className="text-gray-500 mb-6">このユーザーは現在アカウントを停止しています</p>
                    <Link href="/" className="inline-block px-8 py-3 bg-primary text-white rounded-2xl font-bold shadow-lg shadow-primary/20 transition-all active:scale-95">
                        ホームに戻る
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-white to-blue-50 pb-32">
            {/* アバター選択肢ポップアップ */}
            {showAvatarMenu && (
                <div className="fixed inset-0 z-[100] flex items-end justify-center">
                    <button
                        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
                        onClick={() => setShowAvatarMenu(false)}
                    />
                    <div className="relative w-full max-w-md rounded-t-2xl bg-white p-6 shadow-2xl animate-in slide-in-from-bottom duration-300">
                        <h3 className="text-lg font-black text-gray-900 mb-4 text-center">プロフィール画像</h3>
                        <div className="space-y-3">
                            <button
                                onClick={() => {
                                    setShowAvatarMenu(false);
                                    setShowAvatarPreview(true);
                                }}
                                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                            >
                                <Eye className="w-5 h-5 text-primary" />
                                <span className="font-bold text-gray-800">画像を拡大表示</span>
                            </button>
                            {isOwnPage && (
                                <button
                                    onClick={() => {
                                        setShowAvatarMenu(false);
                                        setShowAvatarUpload(true);
                                    }}
                                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-primary/5 hover:bg-primary/10 transition-colors text-left"
                                >
                                    <ImagePlus className="w-5 h-5 text-primary" />
                                    <span className="font-bold text-primary">アイコンを変更する</span>
                                </button>
                            )}
                        </div>
                        <button
                            onClick={() => setShowAvatarMenu(false)}
                            className="w-full mt-4 py-3 text-gray-500 font-bold text-sm hover:bg-gray-50 rounded-xl transition-colors"
                        >
                            キャンセル
                        </button>
                    </div>
                </div>
            )}

            {/* アバター拡大表示オーバーレイ */}
            {showAvatarPreview && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm">
                    <button
                        className="absolute top-6 right-6 p-2 bg-white/20 hover:bg-white/30 rounded-full transition-colors"
                        onClick={() => setShowAvatarPreview(false)}
                    >
                        <X className="w-6 h-6 text-white" />
                    </button>
                    <div className="w-72 h-72 rounded-full overflow-hidden border-4 border-white/20 shadow-2xl">
                        {profile.avatar_url ? (
                            <Image src={profile.avatar_url} alt="Avatar" width={288} height={288} className="w-full h-full object-cover" unoptimized />
                        ) : (
                            <div className="w-full h-full bg-primary/10 flex items-center justify-center">
                                <User className="w-24 h-24 text-primary/40" />
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* アバターアップロードモーダル */}
            {showAvatarUpload && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center">
                    <button
                        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
                        onClick={() => { setShowAvatarUpload(false); setAvatarError(""); }}
                    />
                    <div className="relative w-full max-w-sm mx-6 bg-white rounded-2xl shadow-2xl p-8 text-center">
                        <button
                            className="absolute top-4 right-4 p-1.5 hover:bg-gray-100 rounded-full transition-colors"
                            onClick={() => { setShowAvatarUpload(false); setAvatarError(""); }}
                        >
                            <X className="w-5 h-5 text-gray-400" />
                        </button>
                        <h3 className="text-lg font-black text-gray-900 mb-4">アイコンを変更</h3>
                        <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-primary/20 mx-auto mb-4">
                            {profile.avatar_url ? (
                                <Image src={profile.avatar_url} alt="Avatar" width={112} height={112} className="w-full h-full object-cover" unoptimized />
                            ) : (
                                <div className="w-full h-full bg-primary/10 flex items-center justify-center">
                                    <User className="w-12 h-12 text-primary/40" />
                                </div>
                            )}
                        </div>
                        {avatarError && (
                            <p className="text-sm text-red-500 mb-3">{avatarError}</p>
                        )}
                        <button
                            onClick={() => avatarFileRef.current?.click()}
                            disabled={uploadingAvatar}
                            className="w-full py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {uploadingAvatar ? (
                                <><Loader2 className="w-5 h-5 animate-spin" />アップロード中...</>
                            ) : (
                                <><Camera className="w-5 h-5" />画像を選択</>
                            )}
                        </button>
                        <p className="text-xs text-gray-400 mt-2">2MB以下の画像ファイル</p>
                        <input
                            ref={avatarFileRef}
                            type="file"
                            accept={ALLOWED_IMAGE_ACCEPT}
                            onChange={handleAvatarUpload}
                            className="hidden"
                        />
                    </div>
                </div>
            )}

            {/* Header */}
            <header className="bg-white/80 backdrop-blur-md px-6 pt-8 pb-8 border-b border-gray-100 shadow-sm">
                <div className="flex items-center gap-4 mb-8">
                    <button onClick={() => window.history.back()} className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors active:scale-90">
                        <ArrowLeft className="w-6 h-6 text-gray-600" />
                    </button>
                    <h1 className="text-2xl font-black text-gray-900 tracking-tighter">出品者情報</h1>
                </div>

                {/* Seller Profile Info Card */}
                <div className="flex items-center gap-5 transition-transform">
                    {/* アバター（タップで選択肢を表示） */}
                    <button
                        onClick={() => setShowAvatarMenu(true)}
                        className="relative flex-shrink-0 active:scale-95 transition-transform"
                    >
                        <RewardAvatar
                            src={profile.avatar_url}
                            alt="Avatar"
                            size={80}
                            listingCount={listingCount}
                            earlyRegistration={resolveEarlyRegistrationEligible(profile.created_at, rewardSetting, rewardOverride)}
                        />
                        {isOwnPage && (
                            <div className="absolute -bottom-0.5 -right-0.5 w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center shadow-md border-2 border-white">
                                <Camera className="w-3 h-3" />
                            </div>
                        )}
                    </button>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <h2 className="text-2xl font-black text-gray-900 truncate">
                                {profile.nickname}
                            </h2>
                            {isOwnPage && (
                                <Link
                                    href="/profile/edit?from=seller"
                                    className="flex-shrink-0 p-1.5 hover:bg-gray-100 rounded-full transition-colors active:scale-90"
                                    aria-label="プロフィールを編集"
                                >
                                    <Pencil className="w-4 h-4 text-gray-400" />
                                </Link>
                            )}
                        </div>
                        <RewardBadges badges={badges} />
                        <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                                <div className="flex text-yellow-500">
                                    {[...Array(5)].map((_, i) => (
                                        <Star 
                                            key={i} 
                                            className={`w-4 h-4 ${i < Math.round(averageRating) ? "fill-current" : "text-gray-200"}`} 
                                        />
                                    ))}
                                </div>
                                <span className="text-sm font-black text-gray-500">
                                    {listingCount}件出品
                                </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="rounded-2xl bg-primary/5 px-3 py-2 text-center">
                                    <p className="text-[10px] font-black text-primary/70">出品数</p>
                                    <p className="text-base font-black text-primary">{listingCount}件</p>
                                </div>
                                <div className="rounded-2xl bg-gray-50 px-3 py-2 text-center">
                                    <p className="text-[10px] font-black text-gray-500">取引数</p>
                                    <p className="text-base font-black text-gray-900">{transactionCount}件</p>
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-gray-600">
                                <div className="flex items-center gap-1.5">
                                    <GraduationCap className="w-4 h-4 text-primary/60" />
                                    <span className="text-sm font-bold">{profile.department}</span>
                                </div>
                                {profile.major && (
                                    <div className="flex items-center">
                                        <span className="text-[10px] font-black bg-primary/10 text-primary px-2 py-0.5 rounded-full uppercase tracking-wider">
                                            {profile.major}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* Items Section */}
            <div className="px-6 py-10">
                <div className="flex items-center justify-between mb-6 px-1">
                    <h3 className="text-lg font-black text-gray-800 flex items-center gap-2">
                        <ImageIcon className="w-5 h-5 text-primary" strokeWidth={2.5} />
                        出品中の商品
                    </h3>
                    <span className="text-sm font-black text-primary bg-primary/5 px-3 py-1 rounded-full">
                        {items.length}件
                    </span>
                </div>

                {items.length === 0 ? (
                    <div className="text-center py-12">
                        <p className="text-gray-500">現在出品中の商品はありません</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {items.map((item) => (
                            <Link key={item.id} href={`/product/${item.id}`}>
                                <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-md hover:shadow-xl hover:border-primary/30 hover:-translate-y-1 transition-all duration-300">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="relative h-24 w-16 flex-shrink-0 overflow-hidden rounded-xl border border-gray-100 bg-gray-50 shadow-sm">
                                            {getItemImageUrl(item, "front", "thumbnail") ? (
                                                <Image
                                                    src={getItemImageUrl(item, "front", "thumbnail")!}
                                                    alt={item.title}
                                                    fill
                                                    sizes="64px"
                                                    className="object-cover"
                                                    unoptimized
                                                />
                                            ) : (
                                                <div className="flex h-full w-full items-center justify-center">
                                                    <ImageIcon className="h-6 w-6 text-gray-300" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-lg font-bold text-gray-900 mb-2 line-clamp-2">
                                                {item.title}
                                            </h3>
                                            <p className="text-2xl font-bold text-primary">
                                                ¥{item.selling_price.toLocaleString()}
                                            </p>
                                        </div>
                                        <div className="relative">
                                        <LoginRequiredBubble visible={loginPrompt.visible && loginPromptItemId === item.id} />
                                        <button
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                toggleFavorite(item.id);
                                            }}
                                            className="p-2 hover:bg-gray-100 rounded-full transition-all active:scale-90"
                                            aria-label={favorites.includes(item.id) ? "お気に入りから削除" : "お気に入りに追加"}
                                        >
                                            <Heart
                                                className={`w-6 h-6 transition-all duration-200 ${favorites.includes(item.id)
                                                    ? "fill-red-500 text-red-500 scale-110"
                                                    : "text-gray-300 hover:text-red-300"
                                                    }`}
                                            />
                                        </button>
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
