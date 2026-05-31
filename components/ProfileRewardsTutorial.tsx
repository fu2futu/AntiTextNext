"use client";

import { useEffect, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight, Sparkles, X } from "lucide-react";

type ProfileRewardsTutorialProps = {
  onClose: () => void;
};

const frameSteps = [
  { count: "0", label: "白", className: "reward-avatar-frame--white" },
  { count: "1", label: "黄色", className: "reward-avatar-frame--yellow" },
  { count: "5", label: "緑", className: "reward-avatar-frame--green" },
  { count: "10", label: "薄い青", className: "reward-avatar-frame--sky" },
  { count: "20", label: "紺", className: "reward-avatar-frame--navy" },
  { count: "?", label: "?", className: "" },
];

function FrameProgressAnimation() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActive((current) => (current + 1) % frameSteps.length);
    }, 850);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="flex h-full flex-col items-center justify-center bg-gradient-to-b from-white to-blue-50 px-5 py-5">
      <div className="mb-5 text-center">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-primary/70">Profile Frame</p>
        <h3 className="mt-1 text-xl font-black text-gray-900">出品で枠が育ちます</h3>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {frameSteps.map((step, index) => (
          <div key={step.count} className="flex flex-col items-center gap-2">
            <div
              className={`${step.className ? `reward-avatar-frame ${step.className}` : "border border-dashed border-gray-300 bg-white"} flex h-16 w-16 items-center justify-center rounded-full transition-all duration-300 ${
                active === index ? "scale-110 shadow-2xl" : "scale-95 opacity-75"
              }`}
            >
              <div className="flex h-full w-full items-center justify-center rounded-full bg-white">
                <span className="text-lg font-black text-gray-700">{step.count}</span>
              </div>
            </div>
            <span className="text-[11px] font-black text-gray-500">{step.label}</span>
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-black text-primary shadow-sm">
        <Sparkles className="h-4 w-4 animate-pulse" />
        累計出品数で自動変化
      </div>
    </div>
  );
}

function BadgeAnimation() {
  const [glow, setGlow] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setGlow((value) => !value), 900);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="flex h-full flex-col items-center justify-center bg-gradient-to-b from-white to-slate-50 px-6 py-5">
      <div className="relative mb-5">
        <div className={`absolute inset-[-28px] rounded-full bg-red-100 transition-opacity duration-500 ${glow ? "opacity-80 blur-xl" : "opacity-20 blur-md"}`} />
        <div className="relative flex h-24 w-24 items-center justify-center">
          <BookOpen className={`h-16 w-16 text-red-500 transition-transform duration-500 ${glow ? "scale-110 rotate-[-4deg]" : "scale-100 rotate-[3deg]"}`} strokeWidth={1.8} />
          <Sparkles className={`absolute -right-2 top-1 h-7 w-7 text-yellow-400 transition-all duration-500 ${glow ? "scale-125 opacity-100" : "scale-90 opacity-50"}`} />
        </div>
      </div>
      <div className="rounded-2xl border border-slate-100 bg-white p-3 text-center shadow-sm">
        <p className="text-lg font-black text-gray-900">バッジ</p>
        <p className="mt-2 text-sm font-bold leading-6 text-gray-600">
          特定の条件でもらえることがあります。表示された本のマークをタップすると詳細を確認できます。
        </p>
      </div>
    </div>
  );
}

const steps = [
  {
    title: "出品数でアイコン枠が変わります",
    description: "累計出品数に応じて 0:白 → 1:黄色 → 5:緑 → 10:薄い青 → 20:紺 → ?:シークレット に変化します。",
    Component: FrameProgressAnimation,
  },
  {
    title: "バッジが付くことがあります",
    description: "バグ発見や改善提案など、特定の条件でマイページや出品者情報にバッジが表示されます。",
    Component: BadgeAnimation,
  },
];

export default function ProfileRewardsTutorial({ onClose }: ProfileRewardsTutorialProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const CurrentAnimation = steps[currentStep].Component;

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-sm flex-col overflow-hidden rounded-3xl bg-white shadow-2xl animate-scale-in">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-full bg-gray-100 p-2 transition-colors hover:bg-gray-200"
          aria-label="閉じる"
        >
          <X className="h-4 w-4 text-gray-600" />
        </button>

        <div className="relative h-[min(50dvh,360px)] min-h-[300px] w-full shrink-0 overflow-hidden rounded-t-3xl bg-gray-100">
          <CurrentAnimation />
        </div>

        <div className="overflow-y-auto p-5">
          <h2 className="mb-2 text-center text-xl font-bold text-gray-900">
            {steps[currentStep].title}
          </h2>
          <p className="mb-6 text-center text-sm leading-6 text-gray-600">
            {steps[currentStep].description}
          </p>

          <div className="flex gap-3">
            <button
              onClick={() => setCurrentStep((step) => Math.max(0, step - 1))}
              disabled={currentStep === 0}
              className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-gray-300 px-4 py-3 font-medium text-gray-700 transition-all hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
            <button
              onClick={handleNext}
              className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-gray-300 px-4 py-3 font-medium text-gray-700 transition-all hover:bg-gray-50"
            >
              {currentStep === steps.length - 1 ? "OK" : "Next"}
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 flex justify-center gap-2">
            {steps.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentStep(index)}
                className={`h-2 rounded-full transition-all ${index === currentStep ? "w-4 bg-primary" : "w-2 bg-gray-300 hover:bg-gray-400"}`}
                aria-label={`${index + 1}ページ目`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
