"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth-provider";
import { ArrowLeft, User, GraduationCap, Camera, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { ProfileSkeleton } from "./skeleton";
import { ALLOWED_IMAGE_ACCEPT, ALLOWED_IMAGE_MIME_TYPES } from "@/lib/image-storage";
import { INPUT_LIMITS } from "@/lib/input-limits";

type Profile = {
    nickname: string | null;
    department: string | null;
    avatar_url: string | null;
    degree: string | null;
    grade: number | null;
    major: string | null;
};

type ProfileClientProps = {
    initialProfile: Profile | null;
    serverSession?: boolean;
};

export default function ProfileClient({ initialProfile, serverSession = true }: ProfileClientProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const fromParam = searchParams.get('from');
    const returnToParam = searchParams.get('returnTo');
    const { user, loading: authLoading, refreshAvatar } = useAuth();
    const [nickname, setNickname] = useState(initialProfile?.nickname || "");
    const [department, setDepartment] = useState(initialProfile?.department || "");
    const [degree, setDegree] = useState(initialProfile?.degree || "学士");
    const [grade, setGrade] = useState((initialProfile?.grade || "1").toString());
    const [major, setMajor] = useState(initialProfile?.major || "");
    const [avatarUrl, setAvatarUrl] = useState<string | null>(initialProfile?.avatar_url || null);
    const [saving, setSaving] = useState(false);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);
    const [initialCheckDone, setInitialCheckDone] = useState(serverSession);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ユーザーネーム重複チェック用
    const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
    const [usernameMessage, setUsernameMessage] = useState("");
    const debounceRef = useRef<NodeJS.Timeout | null>(null);
    const originalNickname = useRef(initialProfile?.nickname || "");

    // If server didn't find a session, check client-side on mount
    useEffect(() => {
        if (!authLoading && !user) {
            router.replace("/auth/login");
            router.refresh();
            return;
        }

        if (!serverSession && !authLoading) {
            if (!user) {
                router.replace("/auth/login");
            } else {
                setInitialCheckDone(true);
            }
        }
    }, [user, authLoading, serverSession, router]);

    // ユーザーネームのリアルタイム重複チェック
    const checkUsername = useCallback(async (value: string) => {
        // 元のニックネームと同じなら常にOK
        if (value === originalNickname.current) {
            setUsernameStatus("idle");
            setUsernameMessage("");
            return;
        }

        if (!value || value.trim().length === 0) {
            setUsernameStatus("idle");
            setUsernameMessage("");
            return;
        }

        // フロントエンドバリデーション
        const usernameRegex = /^[a-zA-Z0-9_\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3400-\u4DBF]{2,20}$/;
        if (!usernameRegex.test(value)) {
            setUsernameStatus("invalid");
            setUsernameMessage("2〜20文字の日本語・英数字・アンダースコアのみ使用可能です");
            return;
        }

        setUsernameStatus("checking");
        setUsernameMessage("確認中...");

        try {
            const params = new URLSearchParams({ nickname: value });
            if (user?.id) {
                params.set("excludeUserId", user.id);
            }
            const res = await fetch(`/api/check-username?${params.toString()}`);
            const data = await res.json();

            if (data.available) {
                setUsernameStatus("available");
                setUsernameMessage("使用できます");
            } else {
                setUsernameStatus("taken");
                setUsernameMessage(data.error || "このユーザーネームは使用されています");
            }
        } catch {
            setUsernameStatus("idle");
            setUsernameMessage("確認に失敗しました");
        }
    }, [user?.id]);

    const handleNicknameChange = (value: string) => {
        setNickname(value);

        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }

        debounceRef.current = setTimeout(() => {
            checkUsername(value);
        }, 500);
    };

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user) return;

        if (!ALLOWED_IMAGE_MIME_TYPES.has(file.type)) {
            setError("アップロードできる画像は JPG / PNG / WebP のみです");
            return;
        }

        if (file.size > 2 * 1024 * 1024) {
            setError("ファイルサイズは2MB以下にしてください");
            return;
        }

        setUploadingAvatar(true);
        setError("");

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

            setAvatarUrl(newAvatarUrl);
            refreshAvatar();
            setSuccess(true);
            setTimeout(() => setSuccess(false), 3000);
        } catch (err: any) {
            console.error("Error uploading avatar:", err);
            setError("画像のアップロードに失敗しました: " + err.message);
        } finally {
            setUploadingAvatar(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        // ユーザーネームが変更されている場合、重複チェックを通過しているか確認
        if (nickname !== originalNickname.current) {
            if (usernameStatus !== "available") {
                setError("有効なユーザーネームを入力してください");
                return;
            }
        }

        // バリデーション
        const usernameRegex = new RegExp(`^[a-zA-Z0-9_\\u3040-\\u309F\\u30A0-\\u30FF\\u4E00-\\u9FAF\\u3400-\\u4DBF]{${INPUT_LIMITS.profileNicknameMin},${INPUT_LIMITS.profileNicknameMax}}$`);
        if (!usernameRegex.test(nickname)) {
            setError(`ユーザーネームは${INPUT_LIMITS.profileNicknameMin}〜${INPUT_LIMITS.profileNicknameMax}文字の日本語・英数字・アンダースコアのみ使用可能です`);
            return;
        }

        setSaving(true);
        setError("");
        setSuccess(false);

        try {
            const { error } = await (supabase
                .from("profiles") as any)
                .update({
                    nickname,
                    department,
                    degree,
                    grade: parseInt(grade),
                    major: (degree !== "学士" || parseInt(grade) >= 2) ? major : null,
                })
                .eq("user_id", user.id);

            if (error) {
                if (error.message?.includes("duplicate") || error.message?.includes("unique")) {
                    setError("このユーザーネームは既に使用されています。別のユーザーネームを選んでください。");
                    setUsernameStatus("taken");
                    setUsernameMessage("このユーザーネームは使用されています");
                } else {
                    throw error;
                }
                return;
            }

            originalNickname.current = nickname;
            setUsernameStatus("idle");
            setUsernameMessage("");
            setSuccess(true);
            
            // 保存成功後、元のページに戻る
            setTimeout(() => {
                if (fromParam === 'seller' && user) {
                    router.replace(returnToParam === 'profile' ? `/seller/${user.id}?from=profile` : `/seller/${user.id}`);
                } else {
                    router.replace('/profile');
                }
                router.refresh();
            }, 800);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    if (!initialCheckDone || authLoading) {
        return <ProfileSkeleton />;
    }

    if (!user) {
        return null;
    }

    // ユーザーネーム変更時のみ保存ボタンの無効を判定
    const isNicknameChanged = nickname !== originalNickname.current;
    const isSaveDisabled = saving || (isNicknameChanged && usernameStatus !== "available");

    return (
        <div className="min-h-screen bg-white pb-24">
            <header className="bg-white px-6 pt-8 pb-6 border-b">
                <div className="flex items-center gap-4 mb-6">
                    <button onClick={() => {
                        if (fromParam === 'seller' && user) {
                            router.replace(returnToParam === 'profile' ? `/seller/${user.id}?from=profile` : `/seller/${user.id}`);
                        } else {
                            router.replace('/profile');
                        }
                    }}>
                        <ArrowLeft className="w-6 h-6 text-gray-600 hover:text-primary transition-colors" />
                    </button>
                    <h1 className="text-3xl font-bold text-primary">
                        プロフィール編集
                    </h1>
                </div>
            </header>

            <div className="px-6 py-8">
                <div className="max-w-md mx-auto">
                    <div className="bg-white rounded-2xl shadow-lg border p-8">
                        <div className="flex flex-col items-center mb-8">
                            <div className="relative">
                                <div className="w-24 h-24 rounded-full bg-gray-100 overflow-hidden border-4 border-primary/20">
                                    {avatarUrl ? (
                                        <Image
                                            src={avatarUrl}
                                            alt="プロフィール画像"
                                            width={96}
                                            height={96}
                                            className="w-full h-full object-cover"
                                            unoptimized
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-primary/10">
                                            <User className="w-12 h-12 text-primary/50" />
                                        </div>
                                    )}
                                </div>
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={uploadingAvatar}
                                    className="absolute bottom-0 right-0 w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center shadow-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                                    aria-label="プロフィール画像を変更"
                                >
                                    {uploadingAvatar ? (
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                        <Camera className="w-4 h-4" />
                                    )}
                                </button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept={ALLOWED_IMAGE_ACCEPT}
                                    onChange={handleAvatarUpload}
                                    className="hidden"
                                />
                            </div>
                            <p className="text-sm text-gray-500 mt-2">タップして画像を変更</p>
                        </div>

                        <div className="mb-6">
                            <h2 className="text-xl font-bold text-gray-900 mb-2">
                                アカウント情報
                            </h2>
                            <p className="text-sm text-gray-600">{user?.email}</p>
                        </div>

                        {error && (
                            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                                {error}
                            </div>
                        )}

                        {success && (
                            <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-xl text-green-600 text-sm">
                                プロフィールを更新しました
                            </div>
                        )}

                        <form onSubmit={handleSave} className="space-y-5">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    <User className="w-4 h-4 inline mr-1" />
                                    ユーザーネーム
                                </label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={nickname}
                                        onChange={(e) => handleNicknameChange(e.target.value)}
                                        className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 transition-all pr-10 ${
                                            isNicknameChanged && usernameStatus === "available"
                                                ? "border-green-400 focus:ring-green-400"
                                                : isNicknameChanged && (usernameStatus === "taken" || usernameStatus === "invalid")
                                                    ? "border-red-400 focus:ring-red-400"
                                                    : "border-gray-300 focus:ring-primary"
                                        } focus:border-transparent`}
                                        required
                                        maxLength={INPUT_LIMITS.profileNicknameMax}
                                    />
                                    {isNicknameChanged && (
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                            {usernameStatus === "checking" && (
                                                <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                                            )}
                                            {usernameStatus === "available" && (
                                                <CheckCircle className="w-5 h-5 text-green-500" />
                                            )}
                                            {(usernameStatus === "taken" || usernameStatus === "invalid") && (
                                                <XCircle className="w-5 h-5 text-red-500" />
                                            )}
                                        </div>
                                    )}
                                </div>
                                {isNicknameChanged && usernameMessage && (
                                    <p className={`text-xs mt-1 ${
                                        usernameStatus === "available" ? "text-green-600" :
                                        usernameStatus === "taken" || usernameStatus === "invalid" ? "text-red-600" :
                                        "text-gray-500"
                                    }`}>
                                        {usernameMessage}
                                    </p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                     <GraduationCap className="w-4 h-4 inline mr-1" />
                                     学院
                                </label>
                                <select
                                     value={department}
                                     onChange={(e) => {
                                         setDepartment(e.target.value);
                                         setMajor("");
                                     }}
                                     className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                                     required
                                >
                                     <option value="">選択してください</option>
                                     <option value="理学院">理学院</option>
                                     <option value="工学院">工学院</option>
                                     <option value="物質理工学院">物質理工学院</option>
                                     <option value="情報理工学院">情報理工学院</option>
                                     <option value="生命理工学院">生命理工学院</option>
                                     <option value="環境・社会理工学院">環境・社会理工学院</option>
                                     <option value="その他">その他</option>
                                </select>
                            </div>

                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        課程
                                    </label>
                                    <select
                                        value={degree}
                                        onChange={(e) => setDegree(e.target.value)}
                                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                                        required
                                    >
                                        <option value="学士">学士</option>
                                        <option value="修士">修士</option>
                                        <option value="博士">博士</option>
                                    </select>
                                </div>
                                <div className="flex-1">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        学年
                                    </label>
                                    <select
                                        value={grade}
                                        onChange={(e) => setGrade(e.target.value)}
                                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                                        required
                                    >
                                        {degree === "学士" && [1, 2, 3, 4].map(g => (
                                            <option key={g} value={g}>{g}年</option>
                                        ))}
                                        {degree === "修士" && [1, 2].map(g => (
                                            <option key={g} value={g}>{g}年</option>
                                        ))}
                                        {degree === "博士" && [1, 2, 3, 4, 5].map(g => (
                                            <option key={g} value={g}>{g}年</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {(degree !== "学士" || parseInt(grade) >= 2) && department && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        系（専攻）
                                    </label>
                                    <select
                                        value={major}
                                        onChange={(e) => setMajor(e.target.value)}
                                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                                        required
                                    >
                                        <option value="">選択してください</option>
                                        {department === "理学院" && ["数学系", "物理学系", "化学系", "地球惑星科学系"].map(m => (
                                            <option key={m} value={m}>{m}</option>
                                        ))}
                                        {department === "工学院" && ["機械系", "システム制御系", "電気電子系", "情報通信系", "経営工学系"].map(m => (
                                            <option key={m} value={m}>{m}</option>
                                        ))}
                                        {department === "物質理工学院" && ["材料系", "応用科学系"].map(m => (
                                            <option key={m} value={m}>{m}</option>
                                        ))}
                                        {department === "情報理工学院" && ["数理・計算科学系", "情報工学系"].map(m => (
                                            <option key={m} value={m}>{m}</option>
                                        ))}
                                        {department === "生命理工学院" && ["生命理工系"].map(m => (
                                            <option key={m} value={m}>{m}</option>
                                        ))}
                                        {department === "環境・社会理工学院" && ["建築学系", "土木・環境工学系", "融合理工学系"].map(m => (
                                            <option key={m} value={m}>{m}</option>
                                        ))}
                                        <option value="その他">その他</option>
                                    </select>
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={isSaveDisabled}
                                className="w-full py-4 bg-primary text-white rounded-xl font-semibold text-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg"
                            >
                                {saving ? "保存中..." : "保存"}
                            </button>
                        </form>

                    </div>
                </div>
            </div>
        </div>
    );
}
