"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Upload, Loader2, Camera, X, Scan, AlertCircle, CheckCircle, HelpCircle } from "lucide-react";
import { calculateSellingPrice } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth-provider";
import Quagga from "@ericblade/quagga2";
import ListingTutorial from "@/components/ListingTutorial";
import { LISTING_NOTICE_ITEMS } from "@/lib/legal";
import {
  ALLOWED_IMAGE_ACCEPT,
  assertAllowedImageFile,
  assertAllowedImageFileSignature,
  getImageFailureDiagnostics,
  getImageFailureMessage,
  getImageFailureStage,
  getSafeImageFileMetadata,
  uploadItemImageVariantsToR2,
} from "@/lib/image-storage";
import { INPUT_LIMITS } from "@/lib/input-limits";

type ListingStep = "form" | "confirm" | "success";
type ScanStatus = "idle" | "scanning" | "detected";

const isValidEan13 = (code: string) => {
  if (!/^\d{13}$/.test(code)) return false;

  const digits = code.split("").map(Number);
  const checksum = digits.slice(0, 12).reduce((sum, digit, index) => {
    return sum + digit * (index % 2 === 0 ? 1 : 3);
  }, 0);
  const checkDigit = (10 - (checksum % 10)) % 10;

  return checkDigit === digits[12];
};

const getOriginalPriceValidationMessage = (value: string) => {
  const trimmed = value.trim();
  const numericValue = Number(trimmed);

  if (!trimmed || !Number.isFinite(numericValue)) {
    return "それ日本円じゃ扱えないです...";
  }

  if (numericValue > 50000) {
    return "5万円以内の商品に限ります";
  }

  if (numericValue < 0) {
    return "ボランティア精神は嬉しいんですが、、ややこしくなるので自然数でお願いします";
  }

  if (!Number.isInteger(numericValue) || trimmed.includes(".")) {
    const yearsSinceSmallCurrencyDispositionAct = new Date().getFullYear() - 1953;
    return `少額通貨整理法施行から今年で${yearsSinceSmallCurrencyDispositionAct}年、、自然数でお願いします`;
  }

  if (!/^\d+$/.test(trimmed)) {
    return "それ日本円じゃ扱えないです...";
  }

  return null;
};

export default function ListingPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [step, setStep] = useState<ListingStep>("form");
  const [formData, setFormData] = useState({
    bookName: "",
    originalPrice: "",
    barcode: "",
    //condition: "良好",
    hasDescription: false,
    description: "",
    frontCover: null as File | null,
    backCover: null as File | null,
  });

  const [frontCoverPreview, setFrontCoverPreview] = useState<string>("");
  const [backCoverPreview, setBackCoverPreview] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState<ScanStatus>("idle");
  const [showTutorial, setShowTutorial] = useState(false);
  const [listingNoticeConfirmed, setListingNoticeConfirmed] = useState(false);
  const scannerRef = useRef<HTMLDivElement | null>(null);
  const detectedCodeRef = useRef<string | null>(null);
  const detectionBufferRef = useRef<string[]>([]);
  const detectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopRequestedRef = useRef(false);

  // Check if user has seen the tutorial
  useEffect(() => {
    const hasSeenTutorial = localStorage.getItem('listing_tutorial_seen');
    if (!hasSeenTutorial && user) {
      setShowTutorial(true);
    }
  }, [user]);

  const handleCloseTutorial = () => {
    localStorage.setItem('listing_tutorial_seen', 'true');
    setShowTutorial(false);
  };

  const handleBarcodeSearch = useCallback(async (targetIsbn?: string) => {
    const isbn = (targetIsbn ?? formData.barcode).replace(/-/g, "").trim();
    if (!isbn) return;

    setSearching(true);
    try {
      const response = await fetch(`/api/books/isbn?isbn=${encodeURIComponent(isbn)}`);
      const data = await response.json();

      if (!response.ok) {
        console.error("Book lookup API error:", data);
        if (response.status === 404) {
          alert("書籍が見つかりませんでした。ISBNを確認するか、手動で入力してください。");
        } else if (response.status === 400) {
          alert("ISBNは978または979から始まる13桁の数字を入力してください。");
        } else {
          alert("書籍検索に失敗しました。ISBNを確認するか、手動で入力してください。");
        }
        return;
      }

      if (data.title) {
        setFormData(prev => ({
          ...prev,
          bookName: data.title || prev.bookName,
          originalPrice: data.originalPrice
            ? String(data.originalPrice)
            : prev.originalPrice
        }));
      } else {
        alert("書籍が見つかりませんでした。ISBNを確認するか、手動で入力してください。");
      }
    } catch (error) {
      console.error("Barcode search error:", error);
      alert("検索中にエラーが発生しました。");
    } finally {
      setSearching(false);
    }
  }, [formData.barcode]);

  const releaseCameraStream = useCallback(() => {
    try {
      const video = scannerRef.current?.querySelector("video");
      const stream = video?.srcObject as MediaStream | null;
      stream?.getTracks().forEach(track => track.stop());
      if (video) {
        video.pause();
        video.srcObject = null;
        video.removeAttribute("src");
        video.load();
      }
      Quagga.stop();
    } catch {
    }
    detectionBufferRef.current = [];
    if (detectionTimerRef.current) {
      clearTimeout(detectionTimerRef.current);
      detectionTimerRef.current = null;
    }
  }, []);

  const stopScanner = useCallback(() => {
    stopRequestedRef.current = true;
    releaseCameraStream();
    setIsScanning(false);
    setScanStatus("idle");
  }, [releaseCameraStream]);

  const startScanner = () => {
    detectedCodeRef.current = null;
    detectionBufferRef.current = [];
    stopRequestedRef.current = false;
    setScanStatus("scanning");
    setIsScanning(true);
  };

  useEffect(() => {
    if (!isScanning || !scannerRef.current) return;

    let active = true;

    const handleDetected = (result: any) => {
      const code = String(result?.codeResult?.code || "").replace(/\D/g, "");
      if (!active || detectedCodeRef.current || !/^97[89]\d{10}$/.test(code)) return;
      if (!isValidEan13(code)) return;

      detectionBufferRef.current = [...detectionBufferRef.current.slice(-2), code];
      const matches = detectionBufferRef.current.filter(value => value === code).length;
      if (matches < 2) return;

      detectedCodeRef.current = code;
      setScanStatus("detected");
      setFormData(prev => ({ ...prev, barcode: code }));

      window.setTimeout(() => {
        stopScanner();
        void handleBarcodeSearch(code);
      }, 350);
    };

    (Quagga as any).init(
      {
        frequency: 8,
        inputStream: {
          type: "LiveStream",
          target: scannerRef.current,
          constraints: {
            facingMode: "environment",
            width: { min: 640, ideal: 1920 },
            height: { min: 480, ideal: 1080 },
            aspectRatio: { ideal: 1.777777778 },
          },
          area: {
            top: "20%",
            right: "8%",
            left: "8%",
            bottom: "20%",
          },
        },
        decoder: {
          readers: ["ean_reader"],
          multiple: false,
        },
        locator: {
          halfSample: false,
          patchSize: "medium",
        },
        locate: true,
      },
      (error: any) => {
        if (!active || stopRequestedRef.current) return;

        if (error) {
          console.error("Barcode scanner init error:", error);
          alert("カメラを起動できませんでした。ブラウザのカメラ許可を確認してください。");
          setIsScanning(false);
          setScanStatus("idle");
          return;
        }

        Quagga.onDetected(handleDetected);
        Quagga.start();
      }
    );

    return () => {
      active = false;
      try {
        (Quagga as any).offDetected?.(handleDetected);
      } catch {
      }
      releaseCameraStream();
    };
  }, [handleBarcodeSearch, isScanning, releaseCameraStream, stopScanner]);

  // useEffect内でリダイレクト（SSRでのlocationエラーを防止）
  useEffect(() => {
    if (!user && step === "form") {
      router.push("/auth/login");
    }
  }, [user, step, router]);

  // 未認証時は何も表示しない
  if (!user && step === "form") {
    return null;
  }

  const sellingPrice = formData.originalPrice
    ? calculateSellingPrice(Number(formData.originalPrice))
    : 0;

  const logImageUploadFailure = useCallback(async (
    error: unknown,
    itemId: string | null,
    side: "front" | "back" | "unknown",
    file?: File | null
  ) => {
    if (!user) return;
    const fileMetadata = await getSafeImageFileMetadata(file);

    fetch("/api/listing/image-error-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itemId,
        side,
        stage: getImageFailureStage(error),
        message: getImageFailureMessage(error),
        file: fileMetadata,
        metadata: {
          title_length: formData.bookName.trim().length,
          has_description: formData.hasDescription,
          ...getImageFailureDiagnostics(error),
        },
      }),
    }).catch(() => {
      // 診断ログの失敗で出品操作は止めない。
    });
  }, [formData.bookName, formData.hasDescription, user]);

  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: "front" | "back"
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        assertAllowedImageFile(file);
        await assertAllowedImageFileSignature(file);
      } catch (error: any) {
        void logImageUploadFailure(error, null, type, file);
        alert(error.message || "アップロードできない画像です");
        e.target.value = "";
        return;
      }

      // Blob URLを使用してメモリ効率を改善
      const url = URL.createObjectURL(file);
      if (type === "front") {
        // 古いBlob URLを解放
        if (frontCoverPreview) URL.revokeObjectURL(frontCoverPreview);
        setFrontCoverPreview(url);
        setFormData({ ...formData, frontCover: file });
      } else {
        // 古いBlob URLを解放
        if (backCoverPreview) URL.revokeObjectURL(backCoverPreview);
        setBackCoverPreview(url);
        setFormData({ ...formData, backCover: file });
      }
    }
  };

  const canSubmit = Boolean(
    formData.bookName &&
    formData.originalPrice &&
    //formData.condition &&
    formData.frontCover &&
    formData.backCover &&
    listingNoticeConfirmed
  );

  const handleSubmit = async () => {
    if (uploading) return;
    if (step === "form") {
      if (!canSubmit) return;
      if (formData.bookName.trim().length > INPUT_LIMITS.listingTitleMax) {
        alert(`教科書名は${INPUT_LIMITS.listingTitleMax}文字以内で入力してください`);
        return;
      }
      if (formData.hasDescription && formData.description.trim().length > INPUT_LIMITS.listingDescriptionMax) {
        alert(`商品説明は${INPUT_LIMITS.listingDescriptionMax}文字以内で入力してください`);
        return;
      }
      const priceValidationMessage = getOriginalPriceValidationMessage(formData.originalPrice);
      if (priceValidationMessage) {
        alert(priceValidationMessage);
        return;
      }
      setStep("confirm");
    } else if (step === "confirm") {
      setUploading(true);
      const itemId = crypto.randomUUID();
      const uploadedR2Paths: string[] = [];

      try {
        // Upload images
        let frontImageStoragePath = null;
        let backImageStoragePath = null;
        let frontThumbnailStoragePath = null;
        let backThumbnailStoragePath = null;

        // Persist the scanned ISBN-13 so the listing can be matched to a textbook.
        // Store only a clean 978/979 13-digit value; otherwise leave it null.
        const normalizedIsbn = formData.barcode.replace(/[^0-9]/g, "");
        const isbn = /^97[89]\d{10}$/.test(normalizedIsbn) ? normalizedIsbn : null;

        const { error: draftError } = await (supabase.from("items") as any).insert({
          id: itemId,
          seller_id: user!.id,
          title: formData.bookName,
          description: formData.hasDescription ? formData.description.trim() || null : null,
          original_price: Number(formData.originalPrice),
          selling_price: sellingPrice,
          status: "draft_uploading",
          front_image_url: null,
          back_image_url: null,
          front_thumbnail_url: null,
          back_thumbnail_url: null,
          image_storage_provider: "r2",
          isbn,
        });

        if (draftError) throw draftError;

        if (formData.frontCover) {
          let frontImage;
          try {
            frontImage = await uploadItemImageVariantsToR2(formData.frontCover, itemId, "front");
          } catch (error) {
            await logImageUploadFailure(error, itemId, "front", formData.frontCover);
            throw error;
          }
          frontImageStoragePath = frontImage.detail.path;
          frontThumbnailStoragePath = frontImage.thumbnail.path;
          uploadedR2Paths.push(frontImage.detail.path, frontImage.thumbnail.path);
        }

        if (formData.backCover) {
          let backImage;
          try {
            backImage = await uploadItemImageVariantsToR2(formData.backCover, itemId, "back");
          } catch (error) {
            await logImageUploadFailure(error, itemId, "back", formData.backCover);
            throw error;
          }
          backImageStoragePath = backImage.detail.path;
          backThumbnailStoragePath = backImage.thumbnail.path;
          uploadedR2Paths.push(backImage.detail.path, backImage.thumbnail.path);
        }

        const { data: insertedItem, error } = await (supabase.from("items") as any)
          .update({
            status: "available",
            front_image_storage_path: frontImageStoragePath,
            back_image_storage_path: backImageStoragePath,
            front_thumbnail_storage_path: frontThumbnailStoragePath,
            back_thumbnail_storage_path: backThumbnailStoragePath,
          })
          .eq("id", itemId)
          .eq("seller_id", user!.id)
          .select("id")
          .single();

        if (error) throw error;

        // ウォッチキーワードマッチング（バックグラウンドで実行）
        fetch("/api/check-watch-keywords", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itemId: insertedItem?.id,
          }),
        }).catch(() => {}); // 失敗しても出品自体はブロックしない

        // 分野分類をシラバスDBから取得してキャッシュ（バックグラウンド・失敗無視）
        if (isbn) {
          fetch("/api/subjects/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isbns: [isbn] }),
          }).catch(() => {});
        }

        setStep("success");
        setTimeout(() => {
          router.push("/");
        }, 2000);
      } catch (error: any) {
        if (uploadedR2Paths.length > 0) {
          fetch("/api/item-images/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itemId, paths: uploadedR2Paths }),
          }).catch((deleteError) => {
            console.error("R2アップロード済み画像のクリーンアップに失敗しました", deleteError);
          });
        }
        await (supabase.from("items") as any)
          .update({ status: "deleted" })
          .eq("id", itemId)
          .eq("seller_id", user!.id);
        alert("出品に失敗しました: " + error.message);
        setUploading(false);
      }
    }
  };

  if (step === "success") {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            出品完了！
          </h1>
          <p className="text-lg text-gray-600">
            出品を受け付けました。
            <br />
            ありがとうございます！
          </p>
        </div>
      </div>
    );
  }

  if (step === "confirm") {
    return (
      <div className="min-h-screen bg-white">
        <header className="bg-white px-6 pt-10 pb-8 rounded-b-[40px] shadow-sm">
          <h1 className="text-4xl font-black text-gray-900 tracking-tight">
            出品内容の確認
          </h1>
        </header>

        <div className="px-6 py-8">
          <div className="max-w-2xl mx-auto bg-white rounded-2xl border shadow-lg p-8">
            <div className="space-y-6">
              <div>
                <span className="text-sm font-medium text-gray-600">教科書名</span>
                <p className="text-xl font-bold text-gray-900 mt-1">
                  {formData.bookName}
                </p>
              </div>

              <div>
                <span className="text-sm font-medium text-gray-600">出品価格</span>
                <p className="text-2xl font-bold text-primary mt-1">
                  ¥{sellingPrice.toLocaleString()}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  定価: ¥{Number(formData.originalPrice).toLocaleString()}
                </p>
              </div>

              {formData.hasDescription && formData.description.trim() && (
                <div>
                  <span className="text-sm font-medium text-gray-600">商品説明</span>
                  <p className="mt-2 whitespace-pre-wrap rounded-xl bg-gray-50 p-4 text-sm font-medium leading-6 text-gray-800">
                    {formData.description.trim()}
                  </p>
                </div>
              )}

              <div>
                <span className="text-sm font-medium text-gray-600 block mb-3">写真</span>
                <div className="grid grid-cols-2 gap-4">
                  {frontCoverPreview && (
                    <div>
                      <img
                        src={frontCoverPreview}
                        alt="表紙"
                        className="w-full aspect-[3/4] object-cover rounded-xl border"
                      />
                      <p className="text-center mt-2 text-sm text-gray-600">
                        表紙
                      </p>
                    </div>
                  )}
                  {backCoverPreview && (
                    <div>
                      <img
                        src={backCoverPreview}
                        alt="裏表紙"
                        className="w-full aspect-[3/4] object-cover rounded-xl border"
                      />
                      <p className="text-center mt-2 text-sm text-gray-600">
                        裏表紙
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-8 p-4 bg-blue-50 rounded-xl border border-blue-200">
              <p className="text-center text-gray-700 font-medium">
                上記内容で出品します。
                <br />
                間違いがないかご確認ください
              </p>
            </div>

            <div className="flex gap-4 mt-8">
              <button
                onClick={() => setStep("form")}
                disabled={uploading}
                className="flex-1 py-4 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 disabled:opacity-50 transition-all"
              >
                戻る
              </button>
              <button
                onClick={handleSubmit}
                disabled={uploading}
                className="flex-1 py-4 bg-primary text-white rounded-xl font-semibold hover:bg-primary/90 disabled:opacity-50 transition-all shadow-md flex items-center justify-center gap-2"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    出品中...
                  </>
                ) : (
                  "出品する"
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white font-gentle">
      <style jsx global>{`
        html {
          scroll-padding-top: var(--app-top-offset);
          scroll-behavior: smooth;
        }
        @media (min-width: 1024px) {
          html {
            scroll-padding-top: calc(var(--app-top-offset) + 5rem);
          }
        }
      `}</style>
      {/* Listing Tutorial for first-time visitors */}
      {showTutorial && (
        <ListingTutorial onClose={handleCloseTutorial} />
      )}

      <header className="bg-white px-6 pt-10 pb-8 rounded-b-[40px] shadow-sm lg:pt-6 lg:pb-5 lg:rounded-b-[28px] snap-start">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-4xl font-black text-gray-900 tracking-tight lg:text-3xl">
            教科書の出品
          </h1>
          <button
            type="button"
            onClick={() => setShowTutorial(true)}
            className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-full border border-primary/15 bg-primary/5 text-primary shadow-sm transition-all hover:bg-primary/10 active:scale-95"
            aria-label="出品方法を見る"
          >
            <HelpCircle className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div className="px-6 py-8 lg:py-5 listing-form-compact snap-start">
        <div className="max-w-2xl lg:max-w-4xl mx-auto">
          <div className="bg-white rounded-2xl border shadow-lg p-5 sm:p-8">
            <div className="lg:columns-2 lg:gap-10">
              <div className="animate-slide-in-bottom mb-6 break-inside-avoid">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  バーコード (ISBN) <span className="text-gray-400 text-xs ml-1">※任意</span>
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative min-w-0 flex-1">
                    <input
                      type="text"
                      placeholder="978から始まる13桁の数字"
                      value={formData.barcode}
                      onChange={(e) =>
                        setFormData({ ...formData, barcode: e.target.value })
                      }
                      className="w-full min-w-0 rounded-xl border border-gray-300 py-3 pl-4 pr-14 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <button
                      type="button"
                      onClick={startScanner}
                      className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-gray-100 text-gray-500 shadow-sm ring-1 ring-gray-200 transition-all hover:bg-gray-200 active:scale-95"
                      aria-label="カメラでバーコードを読み取る"
                    >
                      <Camera className="h-5 w-5" />
                    </button>
                  </div>
                  <button
                    onClick={() => handleBarcodeSearch()}
                    disabled={searching || !formData.barcode}
                    className="w-full rounded-xl bg-gray-800 px-4 py-3 font-bold text-white shadow-sm transition-all hover:bg-primary active:scale-95 disabled:opacity-50 sm:w-auto"
                  >
                    {searching ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      "検索"
                    )}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  入力するとタイトルを自動で取得します
                </p>
              </div>

              <div className="animate-slide-in-bottom mb-6 break-inside-avoid">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  教科書名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="例: 機械力学"
                  value={formData.bookName}
                  onChange={(e) =>
                    setFormData({ ...formData, bookName: e.target.value })
                  }
                  maxLength={INPUT_LIMITS.listingTitleMax}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                />
              </div>

              <div className="animate-slide-in-bottom mb-6 break-inside-avoid">
                <label className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-700">
                  <input
                    type="checkbox"
                    checked={formData.hasDescription}
                    onChange={(e) => setFormData({ ...formData, hasDescription: e.target.checked })}
                    className="h-5 w-5 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  状態を説明する(任意)
                </label>
                {formData.hasDescription && (
                  <div className="mt-3">
                    <textarea
                      value={formData.description}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          description: e.target.value.slice(0, INPUT_LIMITS.listingDescriptionMax),
                        })
                      }
                      maxLength={INPUT_LIMITS.listingDescriptionMax}
                      rows={4}
                      placeholder="例: 書き込み少しあり。表紙に小さな折れがあります。"
                      className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm leading-6 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <p className="mt-1 text-right text-xs font-bold text-gray-400">
                      {formData.description.length}/{INPUT_LIMITS.listingDescriptionMax}文字
                    </p>
                  </div>
                )}
              </div>

              <div className="animate-slide-in-bottom mb-6 break-inside-avoid" style={{ animationDelay: '200ms' }}>
                <label className="block text-sm font-medium text-gray-700 mb-3 lg:mb-2">
                  写真 <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-4 lg:max-w-md">
                  <div>
                    <label className="block w-full aspect-[3/4] bg-gray-100 rounded-xl transition-colors border-2 border-dashed border-gray-300 overflow-hidden cursor-pointer hover:bg-gray-200 active:scale-[0.99]">
                      <input
                        type="file"
                        accept={ALLOWED_IMAGE_ACCEPT}
                        onChange={(e) => handleFileUpload(e, "front")}
                        className="hidden"
                      />
                      {frontCoverPreview ? (
                        <img
                          src={frontCoverPreview}
                          alt="表紙"
                          className="w-full h-full object-cover rounded-xl"
                        />
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center">
                          <Upload className="w-10 h-10 text-gray-400 mb-2" />
                          <span className="text-gray-600 text-center px-4 text-sm">
                            表紙を追加
                          </span>
                        </div>
                      )}
                    </label>
                    <div className="mt-2">
                      <label className="block text-center text-[10px] font-bold text-gray-400 underline underline-offset-2 active:scale-[0.98]">
                        うまくいかない場合はこちら
                        <input
                          type="file"
                          accept={ALLOWED_IMAGE_ACCEPT}
                          capture="environment"
                          onChange={(e) => handleFileUpload(e, "front")}
                          className="hidden"
                        />
                      </label>
                    </div>
                    <p className="text-center mt-2 text-sm text-gray-600">表紙</p>
                  </div>

                  <div>
                    <label className="block w-full aspect-[3/4] bg-gray-100 rounded-xl transition-colors border-2 border-dashed border-gray-300 overflow-hidden cursor-pointer hover:bg-gray-200 active:scale-[0.99]">
                      <input
                        type="file"
                        accept={ALLOWED_IMAGE_ACCEPT}
                        onChange={(e) => handleFileUpload(e, "back")}
                        className="hidden"
                      />
                      {backCoverPreview ? (
                        <img
                          src={backCoverPreview}
                          alt="裏表紙"
                          className="w-full h-full object-cover rounded-xl"
                        />
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center">
                          <Upload className="w-10 h-10 text-gray-400 mb-2" />
                          <span className="text-gray-600 text-center px-4 text-sm">
                            裏表紙を追加
                          </span>
                        </div>
                      )}
                    </label>
                    <div className="mt-2">
                      <label className="block text-center text-[10px] font-bold text-gray-400 underline underline-offset-2 active:scale-[0.98]">
                        うまくいかない場合はこちら
                        <input
                          type="file"
                          accept={ALLOWED_IMAGE_ACCEPT}
                          capture="environment"
                          onChange={(e) => handleFileUpload(e, "back")}
                          className="hidden"
                        />
                      </label>
                    </div>
                    <p className="text-center mt-2 text-sm text-gray-600">裏表紙</p>
                  </div>
                </div>
              </div>

              <div className="animate-slide-in-bottom mb-6 break-inside-avoid" style={{ animationDelay: '300ms' }}>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  定価（税抜き） <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  max="50000"
                  step="1"
                  inputMode="numeric"
                  placeholder="例: 3000"
                  value={formData.originalPrice}
                  onChange={(e) =>
                    setFormData({ ...formData, originalPrice: e.target.value })
                  }
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                />
                <p className="text-xs text-gray-500 mt-1">
                  裏表紙に記載されている定価を入力してください
                </p>
              </div>

              <div className="p-4 bg-blue-50 rounded-xl border border-blue-200 animate-slide-in-bottom mb-6 break-inside-avoid" style={{ animationDelay: '400ms' }}>
                <div className="flex items-center justify-between">
                  <span className="text-gray-700 font-medium">出品価格</span>
                  <span className="text-2xl font-bold text-primary">
                    ¥{sellingPrice.toLocaleString()}
                  </span>
                </div>
                <p className="text-xs text-gray-600 mt-2">
                  ※ 定価の約30%で自動計算されます
                </p>
              </div>

              <div className="rounded-xl border-2 border-red-200 bg-red-50 p-4 animate-slide-in-bottom mb-6 break-inside-avoid" style={{ animationDelay: '450ms' }}>
                <div className="flex items-center gap-2 mb-3">
                  <AlertCircle className="w-5 h-5 text-red-600" />
                  <h2 className="font-bold text-red-700">出品前の確認事項</h2>
                </div>
                <ul className="space-y-2 text-sm text-red-900">
                  {LISTING_NOTICE_ITEMS.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="font-bold">・</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => setListingNoticeConfirmed(true)}
                  className={`mt-4 w-full rounded-xl py-3 font-semibold transition-all flex items-center justify-center gap-2 ${
                    listingNoticeConfirmed
                      ? "bg-green-600 text-white"
                      : "bg-white text-red-700 border border-red-200 hover:bg-red-100"
                  }`}
                >
                  <CheckCircle className="w-5 h-5" />
                  {listingNoticeConfirmed ? "確認済み" : "確認した"}
                </button>
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={`w-full mt-8 py-4 rounded-xl font-semibold text-lg transition-all shadow-md animate-slide-in-bottom lg:mt-5 lg:py-3 ${
                canSubmit
                  ? "bg-primary text-white hover:bg-primary/90 hover:shadow-lg"
                  : "bg-gray-200 text-gray-500 cursor-not-allowed shadow-none"
              }`}
              style={{ animationDelay: '500ms' }}
            >
              確認画面へ
            </button>
          </div>
        </div>
      </div>

      {isScanning && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/80 p-0 sm:items-center sm:p-6">
          <div className="w-full max-w-md overflow-hidden rounded-t-[32px] bg-white shadow-2xl sm:rounded-[32px]">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <h2 className="text-lg font-black text-gray-900">
                  {scanStatus === "detected" ? "ISBNを検出しました" : "バーコード読み取り"}
                </h2>
                <p className="text-xs font-bold text-gray-500">
                  978/979から始まるバーコードを枠内に入れてください
                </p>
              </div>
              <button
                type="button"
                onClick={stopScanner}
                className="rounded-full bg-gray-100 p-2 text-gray-600 transition-colors hover:bg-gray-200"
                aria-label="バーコード読み取りを閉じる"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="relative aspect-[3/4] bg-black">
              <div
                ref={scannerRef}
                className="absolute inset-0 overflow-hidden [&_canvas]:hidden [&_video]:h-full [&_video]:w-full [&_video]:object-cover"
              />
              <div
                className={`absolute inset-8 rounded-3xl border-4 transition-colors ${
                  scanStatus === "detected"
                    ? "border-green-400 bg-green-400/15"
                    : "border-primary/70"
                }`}
              >
                {scanStatus === "scanning" && (
                  <div className="absolute inset-x-4 top-1/2 h-1 -translate-y-1/2 animate-pulse rounded-full bg-red-500 shadow-[0_0_18px_rgba(239,68,68,0.8)]" />
                )}
                {scanStatus === "detected" && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500 text-white shadow-lg">
                      <CheckCircle className="h-9 w-9" />
                    </div>
                  </div>
                )}
              </div>

              <div className="absolute left-4 right-4 top-4 flex justify-center">
                <div className="inline-flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-sm font-bold text-white backdrop-blur">
                  <Scan className="h-4 w-4 text-emerald-300" />
                  {scanStatus === "detected" ? "検索しています..." : "読み取り中..."}
                </div>
              </div>
            </div>

            <div className="bg-gray-50 px-5 py-4 text-center text-sm font-bold text-gray-500">
              本を横向きにして、バーコード全体を明るい場所で枠内に入れてください。
              読み取れない場合はISBNの数字を直接入力できます。
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
