"use client";

import { useState, useEffect } from "react";
import { X, ChevronLeft, ChevronRight, Camera, Upload, Check } from "lucide-react";

interface ListingTutorialProps {
    onClose: () => void;
}

// ステップ1: カメラボタンタップアニメーション
function Step1Animation() {
    const [tapped, setTapped] = useState(false);

    useEffect(() => {
        const interval = setInterval(() => {
            setTapped(true);
            setTimeout(() => setTapped(false), 800);
        }, 2000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="w-full h-full bg-white flex flex-col">
            {/* Header */}
            <div className="px-4 py-3 border-b flex items-center gap-3">
                <div className="w-6 h-6 rounded bg-gray-200" />
                <span className="text-lg font-bold text-primary">教科書の出品</span>
            </div>

            {/* Form */}
            <div className="flex-1 p-4 space-y-4">
                {/* ISBN Field */}
                <div>
                    <div className="text-xs text-gray-600 mb-1">バーコード (ISBN)</div>
                    <div className="flex gap-2">
                        <div className="flex-1 h-10 bg-gray-100 rounded-lg border" />
                        <div
                            className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200 ${tapped
                                ? "bg-primary scale-110 shadow-lg"
                                : "bg-gray-100 border"
                                }`}
                        >
                            <Camera className={`w-5 h-5 ${tapped ? "text-white" : "text-gray-500"}`} />
                        </div>
                    </div>
                </div>

                {/* Book Name Field */}
                <div>
                    <div className="text-xs text-gray-600 mb-1">教科書名 *</div>
                    <div className="h-10 bg-gray-100 rounded-lg border" />
                </div>

                {/* Photo Upload */}
                <div>
                    <div className="text-xs text-gray-600 mb-2">写真 *</div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="aspect-[3/4] bg-gray-100 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center">
                            <Upload className="w-6 h-6 text-gray-400 mb-1" />
                            <span className="text-[10px] text-gray-500">表紙</span>
                        </div>
                        <div className="aspect-[3/4] bg-gray-100 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center">
                            <Upload className="w-6 h-6 text-gray-400 mb-1" />
                            <span className="text-[10px] text-gray-500">裏表紙</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tap Indicator */}
            {tapped && (
                <div className="absolute top-1/3 right-8 animate-ping">
                    <div className="w-12 h-12 rounded-full bg-primary/30" />
                </div>
            )}
        </div>
    );
}

// ステップ2: バーコードスキャン→検出完了
function Step2Animation() {
    const [phase, setPhase] = useState<"scanning" | "detected">("scanning");
    const [scanLine, setScanLine] = useState(0);

    useEffect(() => {
        let scanInterval: NodeJS.Timeout;

        const runAnimation = () => {
            setPhase("scanning");
            setScanLine(0);

            scanInterval = setInterval(() => {
                setScanLine(prev => (prev + 2) % 100);
            }, 30);

            setTimeout(() => {
                clearInterval(scanInterval);
                setPhase("detected");
            }, 2500);
        };

        runAnimation();
        const loopInterval = setInterval(runAnimation, 4000);

        return () => {
            clearInterval(scanInterval);
            clearInterval(loopInterval);
        };
    }, []);

    return (
        <div className="w-full h-full bg-black relative overflow-hidden">
            {/* Camera View */}
            <div className="absolute inset-0 bg-gradient-to-b from-gray-800 to-gray-900" />

            {/* Header */}
            <div className="absolute top-0 left-0 right-0 p-3 bg-white z-10 flex items-center justify-between">
                <span className="font-bold text-sm">
                    {phase === "detected" ? "検出しました！" : "バーコードを読み取り中"}
                </span>
                <div className="w-6 h-6 rounded-full bg-gray-100" />
            </div>

            {/* Barcode Area */}
            <div className="absolute top-16 left-4 right-4 bottom-20 flex items-center justify-center">
                <div className={`w-full h-48 rounded-lg transition-all duration-300 ${phase === "detected"
                    ? "border-4 border-green-500 bg-green-500/20"
                    : "border-2 border-blue-400"
                    }`}>
                    {/* Fake Barcode */}
                    <div className="flex items-center justify-center h-full">
                        <div className="flex gap-0.5">
                            {[3, 2, 4, 2, 3, 1, 4, 2, 3, 2, 4, 1, 3, 2, 4, 2, 3, 1, 2, 4].map((w, i) => (
                                <div
                                    key={i}
                                    className="bg-white h-12"
                                    style={{ width: `${w}px` }}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Scan Line */}
                    {phase === "scanning" && (
                        <div
                            className="absolute left-0 right-0 h-0.5 bg-red-500"
                            style={{ top: `${scanLine}%` }}
                        />
                    )}

                    {/* Detected Check */}
                    {phase === "detected" && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center animate-bounce-in">
                                <Check className="w-10 h-10 text-white" strokeWidth={3} />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Auto detect indicator */}
            {phase === "scanning" && (
                <div className="absolute top-20 left-0 right-0 flex justify-center">
                    <div className="bg-black/60 text-white px-3 py-1 rounded-full text-xs flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                        自動検出中...
                    </div>
                </div>
            )}

            {/* Bottom */}
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gray-50 text-center">
                <span className={`text-xs ${phase === "detected" ? "text-green-600 font-medium" : "text-gray-500"}`}>
                    {phase === "detected"
                        ? "バーコードを検出しました！"
                        : "バーコードを枠に入れてください"}
                </span>
            </div>
        </div>
    );
}

// ステップ3: 教科書の表裏撮影
function Step3Animation() {
    const [phase, setPhase] = useState<"front" | "flipping" | "back">("front");
    const [rotation, setRotation] = useState(0);

    useEffect(() => {
        const runAnimation = () => {
            setPhase("front");
            setRotation(0);

            // Front photo taken
            setTimeout(() => {
                setPhase("flipping");
                // Animate flip
                let r = 0;
                const flipInterval = setInterval(() => {
                    r += 10;
                    setRotation(r);
                    if (r >= 180) {
                        clearInterval(flipInterval);
                        setPhase("back");
                    }
                }, 30);
            }, 1500);
        };

        runAnimation();
        const loopInterval = setInterval(runAnimation, 4500);
        return () => clearInterval(loopInterval);
    }, []);

    return (
        <div className="w-full h-full bg-black relative overflow-hidden">
            {/* Camera View */}
            <div className="absolute inset-0 bg-gradient-to-b from-gray-700 to-gray-800" />

            {/* Header */}
            <div className="absolute top-0 left-0 right-0 p-3 bg-white z-10 flex items-center justify-between">
                <span className="font-bold text-sm">
                    {phase === "back" ? "裏表紙を撮影" : "表紙を撮影"}
                </span>
                <div className="w-6 h-6 rounded-full bg-gray-100" />
            </div>

            {/* Book */}
            <div className="absolute top-16 left-0 right-0 bottom-24 flex items-center justify-center perspective-1000">
                <div
                    className="w-48 h-64 relative transition-transform duration-500"
                    style={{
                        transform: `rotateY(${rotation}deg)`,
                        transformStyle: "preserve-3d"
                    }}
                >
                    {/* Front Cover */}
                    <div
                        className="absolute inset-0 bg-gradient-to-br from-blue-600 to-blue-800 rounded-lg shadow-xl flex flex-col items-center justify-center backface-hidden"
                        style={{ backfaceVisibility: "hidden" }}
                    >
                        <div className="text-white text-xl font-bold mb-2">線形代数</div>
                        <div className="text-blue-200 text-xs">入門テキスト</div>
                        <div className="absolute bottom-4 text-blue-300 text-[10px]">表紙</div>
                    </div>

                    {/* Back Cover */}
                    <div
                        className="absolute inset-0 bg-gradient-to-br from-blue-700 to-blue-900 rounded-lg shadow-xl flex flex-col items-center justify-center"
                        style={{
                            backfaceVisibility: "hidden",
                            transform: "rotateY(180deg)"
                        }}
                    >
                        <div className="flex gap-0.5 mb-4">
                            {[2, 1, 3, 1, 2, 1, 3, 1, 2, 1, 3, 1, 2].map((w, i) => (
                                <div key={i} className="bg-white h-8" style={{ width: `${w}px` }} />
                            ))}
                        </div>
                        <div className="text-blue-200 text-xs">ISBN: 978-4-XXX-XXXXX-X</div>
                        <div className="text-white text-sm mt-2">定価: ¥2,200</div>
                        <div className="absolute bottom-4 text-blue-300 text-[10px]">裏表紙</div>
                    </div>
                </div>
            </div>

            {/* Shutter button */}
            <div className="absolute bottom-4 left-0 right-0 flex justify-center">
                <div className={`w-16 h-16 rounded-full bg-white flex items-center justify-center transition-transform ${(phase === "front" || phase === "back") ? "scale-90" : "scale-100"
                    }`}>
                    <div className="w-14 h-14 rounded-full border-2 border-black" />
                </div>
            </div>

            {/* Flash effect */}
            {(phase === "front" || phase === "back") && (
                <div className="absolute inset-0 bg-white animate-flash pointer-events-none" />
            )}
        </div>
    );
}

// ステップ4: 教科書名自動入力→スクロール
function Step4Animation() {
    const [scrollY, setScrollY] = useState(0);
    const [showPhotos, setShowPhotos] = useState(false);

    useEffect(() => {
        const runAnimation = () => {
            setScrollY(0);
            setShowPhotos(false);

            // Start scrolling after showing book name
            setTimeout(() => {
                const scrollInterval = setInterval(() => {
                    setScrollY(prev => {
                        if (prev >= 120) {
                            clearInterval(scrollInterval);
                            setShowPhotos(true);
                            return 120;
                        }
                        return prev + 4;
                    });
                }, 30);
            }, 1500);
        };

        runAnimation();
        const loopInterval = setInterval(runAnimation, 5000);
        return () => clearInterval(loopInterval);
    }, []);

    return (
        <div className="w-full h-full bg-white overflow-hidden relative">
            <div
                className="absolute left-0 right-0 transition-transform duration-100"
                style={{ transform: `translateY(-${scrollY}px)` }}
            >
                {/* Header */}
                <div className="px-4 py-3 border-b flex items-center gap-3">
                    <div className="w-6 h-6 rounded bg-gray-200" />
                    <span className="text-lg font-bold text-primary">教科書の出品</span>
                </div>

                {/* Form */}
                <div className="p-4 space-y-4">
                    {/* ISBN Field */}
                    <div>
                        <div className="text-xs text-gray-600 mb-1">バーコード (ISBN)</div>
                        <div className="flex gap-2">
                            <div className="flex-1 h-10 bg-gray-50 rounded-lg border px-3 flex items-center text-sm text-gray-700">
                                978-4-xxx-xxxxx-x
                            </div>
                            <div className="w-10 h-10 rounded-lg bg-gray-100 border flex items-center justify-center">
                                <Camera className="w-5 h-5 text-gray-500" />
                            </div>
                        </div>
                    </div>

                    {/* Book Name Field - Highlighted */}
                    <div className={`p-3 -m-3 rounded-xl transition-all duration-500 ${scrollY < 50 ? "bg-blue-50 ring-2 ring-primary" : ""
                        }`}>
                        <div className="text-xs text-gray-600 mb-1">教科書名 *</div>
                        <div className="h-10 bg-white rounded-lg border px-3 flex items-center text-sm font-medium">
                            線形代数
                        </div>
                        {scrollY < 50 && (
                            <div className="text-xs text-primary mt-1 flex items-center gap-1">
                                <Check className="w-3 h-3" />
                                自動入力されました
                            </div>
                        )}
                    </div>

                    {/* Photo Upload */}
                    <div className="pt-2">
                        <div className="text-xs text-gray-600 mb-2">写真 *</div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className={`aspect-[3/4] rounded-lg overflow-hidden border-2 transition-all ${showPhotos ? "border-green-500" : "border-dashed border-gray-300"
                                }`}>
                                {showPhotos ? (
                                    <div className="w-full h-full bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center">
                                        <div className="text-white text-xs font-bold">線形代数</div>
                                    </div>
                                ) : (
                                    <div className="w-full h-full bg-gray-100 flex flex-col items-center justify-center">
                                        <Upload className="w-6 h-6 text-gray-400 mb-1" />
                                        <span className="text-[10px] text-gray-500">表紙</span>
                                    </div>
                                )}
                            </div>
                            <div className={`aspect-[3/4] rounded-lg overflow-hidden border-2 transition-all ${showPhotos ? "border-green-500" : "border-dashed border-gray-300"
                                }`}>
                                {showPhotos ? (
                                    <div className="w-full h-full bg-gradient-to-br from-blue-700 to-blue-900 flex flex-col items-center justify-center">
                                        <div className="flex gap-0.5 mb-1">
                                            {[1, 1, 2, 1, 1, 1, 2, 1].map((w, i) => (
                                                <div key={i} className="bg-white h-4" style={{ width: `${w}px` }} />
                                            ))}
                                        </div>
                                        <div className="text-blue-200 text-[8px]">¥2,200</div>
                                    </div>
                                ) : (
                                    <div className="w-full h-full bg-gray-100 flex flex-col items-center justify-center">
                                        <Upload className="w-6 h-6 text-gray-400 mb-1" />
                                        <span className="text-[10px] text-gray-500">裏表紙</span>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex justify-center gap-8 mt-2 text-[10px] text-gray-500">
                            <span>表紙</span>
                            <span>裏表紙</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ステップ5: 定価入力→出品価格自動計算
function Step5Animation() {
    const [priceText, setPriceText] = useState("");
    const [showSellingPrice, setShowSellingPrice] = useState(false);
    const targetPrice = "2200";

    useEffect(() => {
        const runAnimation = () => {
            setPriceText("");
            setShowSellingPrice(false);

            let i = 0;
            const typeInterval = setInterval(() => {
                if (i < targetPrice.length) {
                    setPriceText(targetPrice.slice(0, i + 1));
                    i++;
                } else {
                    clearInterval(typeInterval);
                    setTimeout(() => setShowSellingPrice(true), 300);
                }
            }, 300);
        };

        runAnimation();
        const loopInterval = setInterval(runAnimation, 5000);
        return () => clearInterval(loopInterval);
    }, []);

    const sellingPrice = priceText ? Math.round(parseInt(priceText) * 0.3) : 0;

    return (
        <div className="w-full h-full bg-white overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b flex items-center gap-3">
                <div className="w-6 h-6 rounded bg-gray-200" />
                <span className="text-lg font-bold text-primary">教科書の出品</span>
            </div>

            <div className="p-4 space-y-4">
                {/* Price Input - Highlighted */}
                <div className="p-3 -m-3 rounded-xl bg-blue-50 ring-2 ring-primary">
                    <div className="text-xs text-gray-600 mb-1">定価（税抜き） *</div>
                    <div className="h-10 bg-white rounded-lg border px-3 flex items-center">
                        <span className="text-sm font-medium">{priceText}</span>
                        <span className="animate-pulse ml-0.5">|</span>
                    </div>
                    <p className="text-[10px] text-gray-500 mt-1">
                        裏表紙に記載されている定価を入力
                    </p>
                </div>

                {/* Selling Price */}
                <div className={`p-4 rounded-xl border transition-all duration-500 ${showSellingPrice
                    ? "bg-blue-50 border-blue-200"
                    : "bg-gray-50 border-gray-200"
                    }`}>
                    <div className="flex items-center justify-between">
                        <span className="text-gray-700 font-medium text-sm">出品価格</span>
                        <span className={`text-2xl font-bold transition-all ${showSellingPrice ? "text-primary scale-110" : "text-gray-400"
                            }`}>
                            ¥{showSellingPrice ? sellingPrice.toLocaleString() : "0"}
                        </span>
                    </div>
                    <p className="text-[10px] text-gray-500 mt-1">
                        ※ 定価の約30%で自動計算されます
                    </p>
                </div>

                {/* Confirm Button */}
                <button className="w-full py-3 bg-primary/50 text-white rounded-xl font-semibold text-sm">
                    確認画面へ
                </button>
            </div>
        </div>
    );
}

// ステップ6: 確認ボタン→出品完了
function Step6Animation() {
    const [phase, setPhase] = useState<"button" | "loading" | "success">("button");

    useEffect(() => {
        const runAnimation = () => {
            setPhase("button");

            setTimeout(() => setPhase("loading"), 1500);
            setTimeout(() => setPhase("success"), 2500);
        };

        runAnimation();
        const loopInterval = setInterval(runAnimation, 5000);
        return () => clearInterval(loopInterval);
    }, []);

    if (phase === "success") {
        return (
            <div className="w-full h-full bg-white flex items-center justify-center">
                <div className="text-center animate-bounce-in">
                    <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Check className="w-10 h-10 text-green-600" strokeWidth={2} />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">出品完了！</h2>
                    <p className="text-sm text-gray-600">
                        出品を受け付けました。
                        <br />
                        ありがとうございます！
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full h-full bg-white overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b">
                <span className="text-lg font-bold text-primary">出品内容の確認</span>
            </div>

            <div className="p-4 space-y-3">
                {/* Summary */}
                <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-500">教科書名</div>
                    <div className="font-bold">線形代数</div>
                </div>

                <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-500">出品価格</div>
                    <div className="text-xl font-bold text-primary">¥660</div>
                    <div className="text-xs text-gray-500">定価: ¥2,200</div>
                </div>

                {/* Photos */}
                <div className="grid grid-cols-2 gap-2">
                    <div className="aspect-[3/4] bg-gradient-to-br from-blue-600 to-blue-800 rounded-lg" />
                    <div className="aspect-[3/4] bg-gradient-to-br from-blue-700 to-blue-900 rounded-lg" />
                </div>

                {/* Confirm Button */}
                <button
                    className={`w-full py-3 rounded-xl font-semibold text-sm transition-all ${phase === "button"
                        ? "bg-primary text-white animate-pulse"
                        : "bg-primary/70 text-white"
                        }`}
                >
                    {phase === "loading" ? (
                        <span className="flex items-center justify-center gap-2">
                            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            出品中...
                        </span>
                    ) : (
                        "出品する"
                    )}
                </button>
            </div>
        </div>
    );
}

const steps = [
    {
        title: "カメラで商品を登録しよう！",
        description: "カメラアイコンをタップしてバーコードをスキャン",
        Component: Step1Animation,
    },
    {
        title: "バーコードをスキャン",
        description: "バーコードをスキャンすると自動で教材を検出します",
        Component: Step2Animation,
    },
    {
        title: "写真を撮影",
        description: "表紙と裏表紙の写真を撮影します",
        Component: Step3Animation,
    },
    {
        title: "教科書名は自動入力",
        description: "バーコードから教科書名が自動で入力されます",
        Component: Step4Animation,
    },
    {
        title: "価格を入力",
        description: "定価を入力すると出品価格が自動計算されます",
        Component: Step5Animation,
    },
    {
        title: "確認して出品完了！",
        description: "内容を確認して出品ボタンを押すだけ",
        Component: Step6Animation,
    },
];

export default function ListingTutorial({ onClose }: ListingTutorialProps) {
    const [currentStep, setCurrentStep] = useState(0);

    const handleNext = () => {
        if (currentStep < steps.length - 1) {
            setCurrentStep(currentStep + 1);
        } else {
            onClose();
        }
    };

    const handleBack = () => {
        if (currentStep > 0) {
            setCurrentStep(currentStep - 1);
        }
    };

    const CurrentAnimation = steps[currentStep].Component;

    return (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl animate-scale-in">
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 z-10 p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors"
                >
                    <X className="w-4 h-4 text-gray-600" />
                </button>

                {/* Animation Area */}
                <div className="relative w-full aspect-[9/16] max-h-[400px] bg-gray-100 overflow-hidden rounded-t-3xl">
                    <CurrentAnimation />
                </div>

                {/* Content */}
                <div className="p-6">
                    <h2 className="text-xl font-bold text-gray-900 text-center mb-2">
                        {steps[currentStep].title}
                    </h2>
                    <p className="text-sm text-gray-600 text-center mb-6">
                        {steps[currentStep].description}
                    </p>

                    {/* Navigation Buttons */}
                    <div className="flex gap-3">
                        <button
                            onClick={handleBack}
                            disabled={currentStep === 0}
                            className="flex-1 py-3 px-4 border border-gray-300 rounded-xl font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1"
                        >
                            <ChevronLeft className="w-4 h-4" />
                            Back
                        </button>
                        <button
                            onClick={handleNext}
                            className="flex-1 py-3 px-4 border border-gray-300 rounded-xl font-medium text-gray-700 hover:bg-gray-50 transition-all flex items-center justify-center gap-1"
                        >
                            {currentStep === steps.length - 1 ? "始める" : "Next"}
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Dot Indicators */}
                    <div className="flex justify-center gap-2 mt-4">
                        {steps.map((_, index) => (
                            <button
                                key={index}
                                onClick={() => setCurrentStep(index)}
                                className={`w-2 h-2 rounded-full transition-all ${index === currentStep
                                    ? "bg-primary w-4"
                                    : "bg-gray-300 hover:bg-gray-400"
                                    }`}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
