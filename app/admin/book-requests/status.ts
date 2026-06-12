export const BOOK_REQUEST_STATUSES = ["open", "posted", "done", "no_action"] as const;

export type BookRequestStatus = (typeof BOOK_REQUEST_STATUSES)[number];

export const BOOK_REQUEST_STATUS_LABELS: Record<string, string> = {
  open: "未対応",
  posted: "ストーリー投稿済み",
  done: "対応済み",
  no_action: "対応不要",
};

export const statusLabel = (value?: string | null) =>
  (value && BOOK_REQUEST_STATUS_LABELS[value]) || value || "未設定";

export const statusTone = (value?: string | null) => {
  switch (value) {
    case "open":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "posted":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "done":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "no_action":
      return "border-slate-200 bg-slate-100 text-slate-600";
    default:
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
};
