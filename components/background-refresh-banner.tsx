"use client";

type BackgroundRefreshBannerProps = {
  visible: boolean;
  hasUpdate?: boolean;
  onApplyUpdate?: () => void;
};

export function BackgroundRefreshBanner({
  visible,
  hasUpdate = false,
  onApplyUpdate,
}: BackgroundRefreshBannerProps) {
  if (!visible && !hasUpdate) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(var(--app-top-offset)+0.5rem)] z-40 flex justify-center px-4">
      <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-primary/15 bg-white/95 px-3 py-1.5 text-[11px] font-black text-primary shadow-sm backdrop-blur-md">
        {hasUpdate ? (
          <>
            <span>最新情報があります</span>
            <button
              type="button"
              onClick={onApplyUpdate}
              className="rounded-full bg-primary px-2.5 py-1 text-[10px] font-black text-white shadow-sm active:scale-95"
            >
              更新
            </button>
          </>
        ) : (
          <>
            <span className="h-3 w-3 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
            最新情報を取得中...
          </>
        )}
      </div>
    </div>
  );
}
