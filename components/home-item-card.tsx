"use client";

import Image from "next/image";
import Link from "next/link";
import { BookOpen, Heart } from "lucide-react";
import { memo } from "react";
import { getItemImageUrl } from "@/lib/image-storage";
import { LoginRequiredBubble } from "@/components/login-required-prompt";

export type HomeItem = {
  id: string;
  title: string;
  selling_price: number;
  front_image_url: string | null;
  front_thumbnail_url?: string | null;
  front_image_storage_path?: string | null;
  front_thumbnail_storage_path?: string | null;
  image_storage_provider?: string | null;
  favorite_count?: number;
  seller_id?: string;
  status?: string;
};

export type MobileHomeLayout = "list" | "square" | "image";

const compactTitle = (title: string) => title.length > 10 ? `${title.slice(0, 10)}...` : title;

export const HomeItemCard = memo(function HomeItemCard({
  item,
  isFavorite,
  onToggleFavorite,
  showLoginPrompt,
  index,
  mobileLayout,
  href,
}: {
  item: HomeItem;
  isFavorite: boolean;
  onToggleFavorite?: (id: string) => void;
  showLoginPrompt?: boolean;
  index: number;
  mobileLayout: MobileHomeLayout;
  href?: string;
}) {
  const isTrading = item.status === "trading" || item.status === "transaction_pending";
  const imageUrl = getItemImageUrl(item, "front", "thumbnail");
  const targetHref = href ?? `/product/${item.id}`;

  const HeartButton = ({ compact = false }: { compact?: boolean }) => (
    <div className="relative flex items-center gap-1">
      <LoginRequiredBubble visible={Boolean(showLoginPrompt)} />
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggleFavorite?.(item.id);
        }}
        disabled={!onToggleFavorite}
        className={`${compact ? "h-9 w-9 bg-white/95 shadow-md ring-1 ring-black/5" : "p-2 -m-2 hover:bg-red-50"} group/heart relative rounded-full transition-all active:scale-90 flex items-center justify-center heart-container disabled:pointer-events-none`}
        aria-label={isFavorite ? "お気に入りから削除" : "お気に入りに追加"}
      >
        <div className={`heart-ring ${isFavorite ? "active" : ""}`} />
        <div className={`heart-particle-container ${isFavorite ? "active" : ""}`}>
          {[...Array(7)].map((_, i) => (
            <div key={i} className="heart-dot" />
          ))}
        </div>
        <Heart
          className={`${compact ? "h-5 w-5" : "h-5 w-5"} transition-all duration-300 relative heart-main ${isFavorite
            ? "fill-red-500 text-red-500 heart-pop"
            : "text-gray-300 group-hover/heart:text-red-300"
          }`}
        />
      </button>
      {!compact && item.favorite_count !== undefined && item.favorite_count > 0 && (
        <span className={`text-xs font-bold transition-colors duration-300 ${isFavorite ? "text-red-500" : "text-gray-400"}`}>
          {item.favorite_count}
        </span>
      )}
      {compact && item.favorite_count !== undefined && item.favorite_count > 0 && (
        <span className="absolute -bottom-1 -right-1 min-w-4 rounded-full bg-red-500 px-1 text-center text-[9px] font-black text-white">
          {item.favorite_count}
        </span>
      )}
    </div>
  );

  const ImageBlock = ({ className = "w-full h-full" }: { className?: string }) => (
    imageUrl ? (
      <Image
        src={imageUrl}
        alt={item.title}
        width={160}
        height={160}
        className={`${className} object-cover`}
        loading="lazy"
        quality={55}
      />
    ) : (
      <div className={`${className} flex items-center justify-center bg-gray-100 text-gray-400`}>
        <BookOpen className="h-8 w-8" />
      </div>
    )
  );

  return (
    <Link href={targetHref} className="block h-full">
      {mobileLayout !== "list" && (
        <div
          className={`relative overflow-hidden rounded-2xl border bg-white shadow-sm transition-all duration-300 animate-slide-in-up md:hidden ${
            isTrading ? "border-gray-200 bg-gray-100" : "border-gray-200"
          }`}
          style={{ animationDelay: `${index * 80}ms` }}
        >
          <div className={`relative aspect-square overflow-hidden bg-gray-100 ${isTrading ? "grayscale opacity-75" : ""}`}>
            <ImageBlock />
            <div className="absolute right-2 top-2 z-10">
              <HeartButton compact />
            </div>
            {isTrading && (
              <div className="absolute left-2 top-2 z-10 rounded-full bg-gray-700 px-2 py-0.5 text-[9px] font-black text-white shadow-sm">
                取引中
              </div>
            )}
          </div>
          {mobileLayout === "square" && (
            <div className="px-2.5 py-2">
              <p className={`truncate text-xs font-black ${isTrading ? "text-gray-500" : "text-gray-900"}`}>
                {compactTitle(item.title)}
              </p>
              <p className={`mt-0.5 text-sm font-black ${isTrading ? "text-gray-500" : "gradient-text-price"}`}>
                ¥{item.selling_price.toLocaleString()}
              </p>
            </div>
          )}
        </div>
      )}
      <div
        className={`relative h-full rounded-xl border p-3 shadow-sm transition-all duration-300 animate-slide-in-up ${mobileLayout !== "list" ? "hidden md:block" : ""} ${
          isTrading
            ? "border-gray-200 bg-gray-100 hover:shadow-lg"
            : "border-gray-200 bg-white hover:shadow-xl hover:border-primary/30 hover:-translate-y-1"
        }`}
        style={{ animationDelay: `${index * 80}ms` }}
      >
        {isTrading && (
          <div className="absolute right-3 top-3 z-10 rounded-full bg-gray-700 px-2.5 py-1 text-[10px] font-black text-white shadow-sm">
            取引中
          </div>
        )}
        <div className="flex items-start gap-3">
          <div className={`w-20 h-20 flex-shrink-0 bg-gray-100 rounded-xl overflow-hidden ${isTrading ? "grayscale opacity-70" : ""}`}>
            <ImageBlock />
          </div>

          <div className="flex-1 min-w-0">
            <h3 className={`text-sm font-bold mb-1 line-clamp-2 leading-snug ${isTrading ? "text-gray-500" : "text-gray-900"}`}>
              {item.title}
            </h3>
            <p className={`text-lg font-bold ${isTrading ? "text-gray-500" : "gradient-text-price"}`}>
              ¥{item.selling_price.toLocaleString()}
            </p>
          </div>

          <HeartButton />
        </div>
      </div>
    </Link>
  );
});
