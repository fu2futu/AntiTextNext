"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { PRIVACY_POLICY_TEXT, TERMS_TEXT } from "@/lib/legal";
import { renderLegalText } from "@/components/legal-text-renderer";

type LegalKind = "terms" | "privacy";

export function LegalLinksPanel() {
  const [active, setActive] = useState<LegalKind | null>(null);

  const title = active === "terms" ? "利用規約" : "プライバシーポリシー";
  const text = active === "terms" ? TERMS_TEXT : PRIVACY_POLICY_TEXT;

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setActive("terms")}
          className="whitespace-nowrap rounded-2xl border border-gray-100 bg-white px-3 py-4 font-sans text-[13px] font-bold text-gray-700 shadow-md transition-all hover:border-primary/30 active:scale-[0.98] sm:text-sm"
        >
          利用規約
        </button>
        <button
          type="button"
          onClick={() => setActive("privacy")}
          className="whitespace-nowrap rounded-2xl border border-gray-100 bg-white px-3 py-4 font-sans text-[13px] font-bold text-gray-700 shadow-md transition-all hover:border-primary/30 active:scale-[0.98] sm:text-sm"
        >
          プライバシーポリシー
        </button>
      </div>

      {active && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center">
          <button
            type="button"
            aria-label="閉じる"
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-200"
            onClick={() => setActive(null)}
          />
          <section className="relative w-full max-w-3xl max-h-[86vh] overflow-hidden rounded-t-2xl bg-white shadow-2xl animate-in slide-in-from-bottom duration-300">
            <div className="flex items-center justify-between border-b bg-white px-6 py-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-primary">TextNext</p>
                <h2 className="text-lg font-bold text-gray-900">{title}</h2>
              </div>
              <button
                type="button"
                onClick={() => setActive(null)}
                className="rounded-full p-2 hover:bg-gray-100"
                aria-label="閉じる"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="max-h-[72vh] overflow-y-auto bg-gray-50 px-4 py-4">
              <div className="rounded-xl border border-gray-100 bg-white px-5 py-6 shadow-sm">
                {renderLegalText(text)}
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
