"use client";

import Image from "next/image";
import { BookOpen, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getListingFrameTone, normalizeBadgeColor, type UserBadge } from "@/lib/rewards";

const frameClasses: Record<string, string> = {
  white: "reward-avatar-frame--white",
  yellow: "reward-avatar-frame--yellow",
  green: "reward-avatar-frame--green",
  sky: "reward-avatar-frame--sky",
  navy: "reward-avatar-frame--navy",
  red: "reward-avatar-frame--red",
  admin: "reward-avatar-frame--admin",
};

const badgeColorClasses: Record<string, string> = {
  yellow: "reward-book-badge-icon--yellow",
  green: "reward-book-badge-icon--green",
  sky: "reward-book-badge-icon--sky",
  navy: "reward-book-badge-icon--navy",
  red: "reward-book-badge-icon--red",
  admin: "reward-book-badge-icon--admin",
};

export function RewardAvatar({
  src,
  alt,
  size = 80,
  listingCount,
  earlyRegistration,
  adminFrame = false,
  className = "",
}: {
  src?: string | null;
  alt: string;
  size?: number;
  listingCount: number;
  earlyRegistration?: boolean;
  adminFrame?: boolean;
  className?: string;
}) {
  const tone = adminFrame ? "admin" : getListingFrameTone(listingCount);
  const sizeStyle = { width: size, height: size };

  return (
    <div
      className={`reward-avatar-frame ${frameClasses[tone]} relative shrink-0 rounded-full ${earlyRegistration ? "reward-sparkle-frame" : ""} ${className}`}
      style={sizeStyle}
      title={earlyRegistration ? "早期登録特典" : undefined}
    >
      {earlyRegistration && <span className="reward-sparkle-overlay" aria-hidden="true" />}
      <div className="h-full w-full overflow-hidden rounded-full bg-primary/10">
        {src ? (
          <Image src={src} alt={alt} width={size} height={size} className="h-full w-full object-cover" unoptimized />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <User className="h-1/2 w-1/2 text-primary/40" />
          </div>
        )}
      </div>
    </div>
  );
}

export function RewardBadges({ badges }: { badges?: UserBadge[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpenId(null);
      }
    };

    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
    };
  }, []);

  if (!badges?.length) return null;

  return (
    <div ref={containerRef} className="mt-2 flex flex-wrap gap-2">
      {badges.map((badge) => {
        const isOpen = openId === badge.id;
        const badgeColor = normalizeBadgeColor(badge.badge_color);
        return (
          <div key={badge.id} className="relative">
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setOpenId(isOpen ? null : badge.id);
              }}
              onMouseDown={(event) => event.stopPropagation()}
              onTouchStart={(event) => event.stopPropagation()}
              className={`reward-book-badge-icon ${badgeColorClasses[badgeColor]} group`}
              aria-expanded={isOpen}
              aria-label={`${badge.label}の詳細`}
            >
              <BookOpen className="h-5 w-5" strokeWidth={1.9} />
            </button>
            {isOpen && (
              <div className="absolute left-0 top-[calc(100%+10px)] z-30 w-64 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-2xl">
                <div className="absolute -top-2 left-5 h-4 w-4 rotate-45 border-l border-t border-slate-200 bg-white" />
                <p className="text-sm font-black text-slate-900">{badge.label}</p>
                <p className="mt-1 text-xs font-bold text-primary">{badge.badge_type}</p>
                <p className="mt-3 whitespace-pre-wrap text-sm font-bold leading-6 text-slate-600">
                  {badge.note || "TextNextの改善に貢献したユーザーに付与されるバッジです。"}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
