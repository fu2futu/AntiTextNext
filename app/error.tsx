"use client";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-xl font-black text-gray-900">読み込みに失敗しました</h1>
        <p className="mt-3 text-sm font-bold leading-6 text-gray-500">
          通信状態を確認して、もう一度お試しください。
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-2xl bg-primary px-4 py-3 text-sm font-black text-white shadow-sm"
          >
            再試行
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-black text-gray-700"
          >
            再読み込み
          </button>
        </div>
      </div>
    </main>
  );
}
