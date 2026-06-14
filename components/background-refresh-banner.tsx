"use client";

export function BackgroundRefreshBanner({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <div className="sticky top-[var(--app-top-offset)] z-40 flex justify-center px-4 pt-2">
      <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-white/95 px-3 py-1.5 text-[11px] font-black text-primary shadow-sm backdrop-blur-md">
        <span className="h-3 w-3 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
        最新情報を取得中...
      </div>
    </div>
  );
}
