import Link from "next/link";
import { TERMS_TEXT } from "@/lib/legal";
import { renderLegalText } from "@/components/legal-text-renderer";

export const metadata = {
  title: "利用規約 | TextNext",
  description: "TextNextの利用規約です。",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <article className="mx-auto max-w-3xl rounded-3xl border border-gray-100 bg-white px-5 py-7 shadow-sm sm:px-8 sm:py-10">
        <div className="mb-6 flex items-center justify-between gap-4 border-b border-gray-100 pb-4">
          <p className="text-xs font-black uppercase tracking-widest text-primary">TextNext</p>
          <Link href="/" className="rounded-full bg-gray-100 px-4 py-2 text-xs font-black text-gray-600 transition hover:bg-gray-200">
            ホームへ
          </Link>
        </div>
        {renderLegalText(TERMS_TEXT)}
      </article>
    </main>
  );
}
